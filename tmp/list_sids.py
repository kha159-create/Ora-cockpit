import json

def list_sids():
    with open('spa/public/employees_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    history = data.get('history', {})
    sids = sorted(history.keys())
    print(f"Total SIDs in history: {len(sids)}")
    print(f"Sample SIDs: {sids[:20]}")
    
    mgmt_path = 'spa/public/management_data.json'
    with open(mgmt_path, 'r', encoding='utf-8') as f:
        mgmt = json.load(f)
    stores = mgmt.get('stores', {})
    print("\nManagement Data Stores (SID -> Name):")
    for sid, name in sorted(stores.items())[:20]:
        print(f"  {sid}: {name}")

if __name__ == "__main__":
    list_sids()
