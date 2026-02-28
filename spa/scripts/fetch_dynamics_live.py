import os
import sys
import json
import logging
import requests
from datetime import datetime, timezone
import urllib.parse
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load local .env if present (for local testing)
env_path = r"C:\Users\Orange1\Desktop\orangettdata222\orangettdata\orangedata\.env"
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    # Try generic fallback for production/deployment
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', 'orangettdata222', 'orangettdata', 'orangedata', '.env'))

def fetch_dynamics_live_data():
    """
    Authenticates with Dynamics 365 API and fetches today's retail transactions.
    Aggregates metrics and outputs live_dynamics_today.json.
    """
    logger.info("Starting Dynamics 365 Live Sales fetch...")

    client_id = (os.environ.get('CLIENT_ID') or os.environ.get('DYNAMICS_CLIENT_ID') or "").strip()
    tenant_id = (os.environ.get('TENANT_ID') or os.environ.get('DYNAMICS_TENANT_ID') or "").strip()
    client_secret = (os.environ.get('CLIENT_SECRET') or os.environ.get('DYNAMICS_CLIENT_SECRET') or "").strip()
    
    # Dynamics Environment Resource URL provided by user
    resource = os.environ.get('DYNAMICS_RESOURCE_URL') or 'https://orangepax.operations.eu.dynamics.com'
    
    # Clean up quotes if present in env vars
    client_id = client_id.strip('"\'')
    tenant_id = tenant_id.strip('"\'')
    client_secret = client_secret.strip('"\'')
    
    if not all([client_id, tenant_id, client_secret]):
        logger.error("Missing required Dynamics 365 credentials in environment.")
        return False
        
    if not resource:
        logger.warning("DYNAMICS_RESOURCE_URL is missing. Cannot fetch data without the target environment URL.")
        # We will pause here and ask the user for the resource URL
        # For demonstration, we'll write an empty struct if we can't fetch
        write_empty_output()
        return False

    # 1. Get OAuth Token
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/token"
    token_data = {
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'resource': resource
    }

    try:
        logger.info("Requesting authentication token...")
        token_response = requests.post(token_url, data=token_data)
        token_response.raise_for_status()
        access_token = token_response.json().get('access_token')
        
        if not access_token:
            logger.error("Failed to retrieve access token from response.")
            return False
            
    except requests.exceptions.RequestException as e:
        logger.error(f"Authentication failed: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response: {e.response.text}")
        return False

    # 2. Query Retail Transactions Lines for Today
    today_str = datetime.now().strftime('%Y-%m-%d')
    
    api_url = f"{resource}/data/RetailTransactionSalesTransBIEntities"
    headers = {
        'Authorization': f'Bearer {access_token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
    
    # Do not urlencode the $ character, OData doesn't like it.
    # The environment uses ReceiptDateRequested in the lines table
    query_string = f"?$filter=ReceiptDateRequested ge {today_str}T00:00:00Z and ReceiptDateRequested le {today_str}T23:59:59Z"
    
    logger.info(f"Querying live retail transactions for {today_str}...")
    
    transactions = []
    
    try:
        req_url = api_url + query_string
        logger.info(f"Using Request URL: {req_url}")
        while req_url:
            response = requests.get(req_url, headers=headers, timeout=120)
            if response.status_code != 200:
                logger.error(f"Error {response.status_code}")
                with open('debug_error.log', 'w', encoding='utf-8') as f:
                    f.write(response.text)
                response.raise_for_status()
                
            data = response.json()
            
            logger.info(f"Received JSON payload length: {len(str(data))}")
                
            transactions.extend(data.get('value', []))
            
            req_url = data.get('@odata.nextLink')
            
        logger.info(f"Successfully fetched {len(transactions)} transactions.")
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to fetch transactions from Dynamics: {e}")
        if hasattr(e, 'response') and e.response:
            logger.error(f"Response: {e.response.text}")
        return False
        
    # 3. Process and Aggregate Lines
    sales_agg = {} # store -> total_sales
    trans_set = {} # store -> set(receiptId)
    emp_agg = {}   # store -> { emp -> { sales: 0, trans_set: set() } }
    
    # --- Ramadan Shifts Aggregation ---
    # shift1: 06:00 - 11:30 (Morning)
    # shift2: 11:30 - 18:00 (Afternoon)
    # shift3: 18:00 - 06:00 (Night)
    shift_agg = {} # store -> { morning: 0, afternoon: 0, night: 0 }
    
    for t in transactions:
        # Ignore Voided transactions like import_dynamics_raw.py does
        if t.get('transactionStatus') == 'Voided':
            continue
            
        store = t.get('store') or t.get('OperatingUnitNumber') or t.get('Store')
        # Employee ID is stored in SalesGroup in the lines table
        staff = t.get('SalesGroup') or ''
        
        # For live daily sales progress, we only care about absolute positive figures (or we assume standard positive accumulation).
        # We will use abs() as the base to match the frontend expectations, since the API returns NetAmount as negative.
        amount = abs(float(t.get('netAmountInclTax') or t.get('NetAmount') or 0.0))
        receipt = str(t.get('transactionId') or t.get('ReceiptId') or '')
        
        # Shift Time parsing
        tx_date_str = t.get('ReceiptDateRequested') or t.get('CreatedDateTime') or t.get('TransactionDate')
        decimal_time = 0.0
        if tx_date_str:
            try:
                # e.g., "2026-03-01T14:30:15Z"
                dt = datetime.fromisoformat(tx_date_str.replace('Z', '+00:00'))
                # Convert to UTC+3 (KSA)
                ksa_dt = dt.astimezone(timezone.utc)
                ksa_hours = (ksa_dt.hour + 3) % 24
                ksa_minutes = ksa_dt.minute
                decimal_time = ksa_hours + (ksa_minutes / 60.0)
            except Exception:
                pass

        if not store: continue
        
        store = str(store).strip()
        staff = str(staff).strip()
        if staff:
             staff = staff.zfill(4) # Normalize to 4 digits like 0037
        
        sales_agg[store] = sales_agg.get(store, 0.0) + amount
        
        if store not in trans_set:
            trans_set[store] = set()
        if receipt:
            trans_set[store].add(receipt)
        
        if staff:
            if store not in emp_agg:
                emp_agg[store] = {}
            if staff not in emp_agg[store]:
                emp_agg[store][staff] = {'sales': 0.0, 'trans_set': set()}
                
            emp_agg[store][staff]['sales'] += amount
            if receipt:
                emp_agg[store][staff]['trans_set'].add(receipt)
                
        # Aggregate Ramadan Shifts
        if store not in shift_agg:
            shift_agg[store] = {'morning': 0.0, 'afternoon': 0.0, 'night': 0.0}
            
        if 6.0 <= decimal_time < 11.5:
            shift_agg[store]['morning'] += amount
        elif 11.5 <= decimal_time < 18.0:
            shift_agg[store]['afternoon'] += amount
        else:
            shift_agg[store]['night'] += amount
    # 4. Format Output for Frontend
    output = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "date": today_str,
        "sales": [[today_str, k, round(v, 2)] for k, v in sales_agg.items()],
        "transactions": [[today_str, k, len(v)] for k, v in trans_set.items()],
        "visitors": [], # Dynamics might not have Visitors (footfall). We leave empty, frontend uses existing.
        "shifts": shift_agg,
        "employee_history": {}
    }
    
    for st, emps in emp_agg.items():
        # [date, empId, sales, trans_count]
        records = []
        for emp_id, metrics in emps.items():
            records.append([today_str, emp_id, round(metrics['sales'], 2), len(metrics['trans_set'])])
        output["employee_history"][st] = records

    write_output(output)
    return True

def write_empty_output():
    today_str = datetime.now().strftime('%Y-%m-%d')
    output = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "date": today_str,
        "sales": [],
        "transactions": [],
        "visitors": [],
        "employee_history": {},
        "error": "Dynamics Resource URL or Credentials missing."
    }
    write_output(output)

def write_output(data):
    # Output to public/data so frontend can fetch it statically
    # or to the same path as management.json
    try:
        # Resolve path relative to script
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # Assuming frontend fetches from /data/live_dynamics.json (usually public/data in vite)
        out_dir = os.path.join(base_dir, 'public', 'data')
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, 'live_dynamics.json')
        
        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        logger.info(f"Successfully wrote live data to {out_file}")
    except Exception as e:
        logger.error(f"Failed to write output file: {e}")

if __name__ == '__main__':
    fetch_dynamics_live_data()
