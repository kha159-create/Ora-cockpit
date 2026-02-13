
import json

def normalize(s):
    if not s: return ""
    return str(s).strip().lower()

def check_mappings():
    try:
        with open('spa/public/management_data.json', 'r', encoding='utf-8') as f:
            mgmt = json.load(f)
        
        with open('spa/public/products_stock.json', 'r', encoding='utf-8') as f:
            stock = json.load(f)
    except:
        print("Error loading files")
        return

    stores = mgmt.get('stores', {})
    name_to_id = {normalize(name): sid for sid, name in stores.items()}
    
    print("\n--- Check Specific Targets ---")
    targets = [
        "04-Andalos Mall", 
        "05-Haifa Mall", 
        "Warehouse", 
        "warehouse riyadh", 
        "Transit",
        " 04-Andalos Mall ", # Check spaces
    ]
    
    for t in targets:
        n = normalize(t)
        sid = name_to_id.get(n)
        print(f"'{t}' -> '{n}' -> ID: {sid if sid else 'FAIL'}")

if __name__ == "__main__":
    check_mappings()
