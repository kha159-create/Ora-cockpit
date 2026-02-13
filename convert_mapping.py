
import pandas as pd
import json
import os

source_file = 'C:/Users/Orange1/Downloads/mapping.xlsx'
target_file = 'C:/Users/Orange1/Desktop/Ora-cockpit/spa/public/product_mapping.json'

try:
    print(f"Reading {source_file}...")
    df = pd.read_excel(source_file)
    
    # Select and rename columns
    # 'Item code', 'dynamic code', 'alias', 'Category'
    # Ensure columns exist
    required_cols = ['Item code', 'dynamic code', 'alias', 'Category']
    
    # Check if columns exist (case sensitive?)
    # User showed: 'Item code', 'dynamic code', 'alias', 'Category', 'english name'
    
    # Prepare list
    products = []
    
    for index, row in df.iterrows():
        try:
            item_code = str(row['Item code']).strip()
            dynamic = str(row['dynamic code']).strip()
            alias = str(row['alias']).strip()
            cat = str(row['Category']).strip()
            
            # Skip empty or invalid
            if not item_code or item_code == 'nan': continue
            
            products.append({
                'id': item_code.replace('.0', ''), # Remove .0 if float
                'dCode': dynamic.replace('.0', ''),
                'alias': alias.replace('.0', ''),
                'cat': cat
            })
        except Exception as row_err:
            print(f"Row error: {row_err}")
            continue

    print(f"converted {len(products)} items.")
    
    with open(target_file, 'w', encoding='utf-8') as f:
        json.dump(products, f, ensure_ascii=False)
        
    print(f"Saved to {target_file}")

except Exception as e:
    print(f"Error: {e}")
