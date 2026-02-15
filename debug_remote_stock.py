import json
import urllib.request
from collections import Counter

STOCK_URL = "https://raw.githubusercontent.com/ALAAWF2/orange-dashboard/main/products_stock.json"
MGMT_URL = "https://raw.githubusercontent.com/ALAAWF2/orange-dashboard/main/management_data.json"

def normalize(name):
    return str(name).strip().lower()

def fetch_json(url):
    try:
        with urllib.request.urlopen(url) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return None

try:
    print("Fetching remote data using urllib...")
    stock_data = fetch_json(STOCK_URL)
    mgmt_data = fetch_json(MGMT_URL)
    
    if not stock_data or not mgmt_data:
        print("Failed to load data.")
        exit(1)
        
    print(f"Loaded {len(stock_data)} stock items.")
    
    # Build Store Map from Management Data
    store_map = {}
    for sid, name in mgmt_data.get('stores', {}).items():
        if name:
            store_map[normalize(name)] = sid
            
    # Add explicit mappings from MainLayout
    store_map['warehouse riyadh'] = '0'
    store_map['transit'] = '0' 
    store_map['warehouse'] = '0'
    
    print("\n--- System Store Mappings ---")
    for name, sid in list(store_map.items())[:10]:
        print(f"'{name}' -> {sid}")
        
    stock_stores = Counter()
    unmapped_stores = Counter()
    
    for item in stock_data:
        branches = item.get('branches')
        if branches and isinstance(branches, dict):
            for br_name, qty in branches.items():
                stock_stores[br_name] += 1
                if normalize(br_name) not in store_map:
                    unmapped_stores[br_name] += 1
        else:
            outlet = item.get('outlet')
            if outlet:
                stock_stores[outlet] += 1
                if normalize(outlet) not in store_map:
                    unmapped_stores[outlet] += 1

    print("\n--- Stock File Store Names (Top 20) ---")
    for name, count in stock_stores.most_common(20):
        is_mapped = "✅" if normalize(name) in store_map else "❌"
        # Print with quotes to see whitespace
        print(f"{is_mapped} '{name}': {count} items")
        
    print("\n--- ❌ UNMAPPED STORES (Fix These) ---")
    for name, count in unmapped_stores.most_common():
        print(f"'{name}' (count: {count})")

except Exception as e:
    print(f"Error: {e}")
