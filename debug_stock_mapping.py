
import json
import os

def normalize(s):
    return str(s).strip()

def main():
    try:
        with open('spa/public/management_data.json', 'r', encoding='utf-8') as f:
            mgmt = json.load(f)
            stores = mgmt.get('stores', {})

        with open('spa/public/products_stock.json', 'r', encoding='utf-8') as f:
            stock = json.load(f)

        print(f"Loaded {len(stores)} stores from management_data.json")
        print(f"Loaded {len(stock)} stock entries from products_stock.json")

        store_name_to_id = {}
        for sid, name in stores.items():
            store_name_to_id[normalize(name)] = sid

        print("\n--- Store Map Sample (Name -> ID) ---")
        for k, v in list(store_name_to_id.items())[:5]:
            print(f"'{k}' -> {v}")

        print("\n--- Stock Outlet Names Sample ---")
        stock_outlets = set()
        for item in stock:
            stock_outlets.add(normalize(item.get('outlet', '')))
        
        for name in list(stock_outlets)[:5]:
            print(f"'{name}'")

        print("\n--- Mapping Check ---")
        matched = 0
        unmatched = 0
        unmatched_examples = []

        for outlet in stock_outlets:
            if outlet in store_name_to_id:
                matched += 1
            else:
                unmatched += 1
                if len(unmatched_examples) < 10:
                    unmatched_examples.append(outlet)

        print(f"Matched Outlets: {matched}")
        print(f"Unmatched Outlets: {unmatched}")
        
        if unmatched_examples:
            print("\nUnmatched Examples:")
            for u in unmatched_examples:
                print(f"'{u}'")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    main()
