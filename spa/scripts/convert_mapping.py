import pandas as pd
import json
import os

file_path = 'C:/Users/Orange1/Downloads/mapping.xlsx'
output_path = 'C:/Users/Orange1/Desktop/Ora-cockpit/spa/public/product_mapping.json'

print(f"Reading {file_path}...")

try:
    df = pd.read_excel(file_path)
    
    # Selecting required columns: 'Item code', 'dynamic code', 'alias', 'Category'
    # We will rename them to: id, dCode, alias, cat
    
    records = []
    for _, row in df.iterrows():
        try:
            item_code = str(row['Item code']).strip() if pd.notna(row['Item code']) else None
            d_code = str(row['dynamic code']).strip() if pd.notna(row['dynamic code']) else None
            alias = str(row['alias']).strip() if pd.notna(row['alias']) else None
            cat = str(row['Category']).strip() if pd.notna(row['Category']) else None
            name = str(row['english name']).strip() if pd.notna(row['english name']) else None
            
            # Skip rows without item code
            if not item_code:
                continue

            # Remove '.0' from float conversions if present (e.g. "123.0" -> "123")
            if item_code.endswith('.0'): item_code = item_code[:-2]
            if d_code and d_code.endswith('.0'): d_code = d_code[:-2]
            if alias and alias.endswith('.0'): alias = alias[:-2]

            record = {'id': item_code}
            if d_code: record['dCode'] = d_code
            if alias: record['alias'] = alias
            if cat: record['cat'] = cat
            if name: record['name'] = name
            
            records.append(record)
        except Exception as row_err:
            print(f"Skipping row due to error: {row_err}")
            continue

    print(f"Extracted {len(records)} records.")
    
    # Write to JSON
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully wrote to {output_path}")

except Exception as e:
    print(f"Pandas processing failed: {e}")
    # Fallback usually redundant if pandas works, but good to have if needed next time.
