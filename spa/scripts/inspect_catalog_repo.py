import pandas as pd
import json
import os

# Path to the user's provided validation repo
repo_path = r"C:\Users\Orange1\Downloads\Compressed\catalog-main\catalog-main"
mapping_xlsx = os.path.join(repo_path, "mapping.xlsx")
products_json = os.path.join(repo_path, "products.json")

print(f"Inspecting {mapping_xlsx}...")
try:
    df = pd.read_excel(mapping_xlsx)
    # Search for 4489518 in any column
    mask = df.apply(lambda row: row.astype(str).str.contains('4489518').any(), axis=1)
    found = df[mask]
    if not found.empty:
        print("Found 4489518 in mapping.xlsx:")
        print(found)
    else:
        print("4489518 NOT found in mapping.xlsx")
except Exception as e:
    print(f"Error reading excel: {e}")

print(f"\nInspecting {products_json}...")
try:
    with open(products_json, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    found_item = None
    if isinstance(data, list):
        for item in data:
            # Check all values
            if '4489518' in str(item.values()):
                found_item = item
                break
    elif isinstance(data, dict):
        # Maybe it's a dict keyed by ID?
        pass

    if found_item:
        print("Found 4489518 in products.json:")
        print(found_item)
    else:
        print("4489518 NOT found in products.json")
except Exception as e:
    print(f"Error reading json: {e}")
