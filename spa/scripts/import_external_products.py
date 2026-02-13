import json
import os
import time

# Paths
external_repo = r"C:\Users\Orange1\Downloads\Compressed\catalog-main\catalog-main"
external_products_json = os.path.join(external_repo, "products.json")
# Use absolute path to match convert_mapping.py
mapping_json_path = r"C:\Users\Orange1\Desktop\Ora-cockpit\spa\public\product_mapping.json"

print(f"Reading external products from {external_products_json}...")

try:
    with open(external_products_json, 'r', encoding='utf-8') as f:
        ext_data = json.load(f)

    # Load existing mapping
    existing_map = []
    if os.path.exists(mapping_json_path):
        with open(mapping_json_path, 'r', encoding='utf-8') as f:
            existing_map = json.load(f)
            
    existing_ids = set(str(item['id']).strip() for item in existing_map if 'id' in item)
    print(f"Loaded {len(existing_map)} existing records from {mapping_json_path}")

    # SAFETY CHECK
    if len(existing_map) < 5000:
        print("ERROR: Existing mapping has too few records. Likely conversion failed or file is empty.")
        print("Aborting to prevent data loss.")
        exit(1)

    new_records = []
    
    if isinstance(ext_data, list):
        print(f"External data has {len(ext_data)} items.")
        
        for item in ext_data:
            # Try to determine ID
            item_id = str(item.get('code') or item.get('id') or item.get('item_code') or item.get('Code') or '').strip()
            
            # If no explicit ID, check 'image_path'
            if not item_id and 'image_path' in item:
                fn = os.path.basename(item['image_path'])
                item_id = os.path.splitext(fn)[0]
            
            # If still valid ID and not already existing
            if item_id and item_id not in existing_ids:
                # Construct record
                record = {
                    'id': item_id,
                    'cat': item.get('category') or item.get('cat') or 'External',
                    'name': item.get('name') or item.get('title') or item.get('english_name') or 'Unknown External Product',
                }
                
                # Check for alias/dCode/barcode
                if 'alias' in item: record['alias'] = str(item['alias'])
                if 'Alias' in item: record['alias'] = str(item['Alias']) 
                
                if 'dynamic_code' in item: record['dCode'] = str(item['dynamic_code'])
                if 'barcode' in item: record['dCode'] = str(item['barcode'])
                
                new_records.append(record)
                existing_ids.add(item_id)

    print(f"Found {len(new_records)} new records from external source.")
    
    # Merge
    final_map = existing_map + new_records
    
    # Save
    with open(mapping_json_path, 'w', encoding='utf-8') as f:
        json.dump(final_map, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully merged. Total records: {len(final_map)}")

except Exception as e:
    print(f"Error importing: {e}")
    exit(1)
