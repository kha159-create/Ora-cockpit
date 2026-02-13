import json
import os

file_path = 'product_analysis_data.json'

if not os.path.exists(file_path):
    print("File not found.")
    exit(1)

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    if 'product_daily_history' in data:
        hist = data['product_daily_history']
        print(f"product_daily_history found with {len(hist)} items.")
        if len(hist) > 0:
            first_key = list(hist.keys())[0]
            first_val = hist[first_key]
            print(f"Key: {first_key}")
            print(f"Value type: {type(first_val)}")
            if isinstance(first_val, list) and len(first_val) > 0:
                 print(f"Sample entry: {first_val[0]}")
    else:
        print("product_daily_history NOT found.")

    if 'catalog' in data:
         print("Catalog found.")
         cat = data['catalog']
         if len(cat) > 0:
             first_cat = list(cat.keys())[0]
             print(f"Sample catalog item in {first_cat}: {cat[first_cat][0]}")

except Exception as e:
    print(f"Error: {e}")
