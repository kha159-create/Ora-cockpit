import json

with open('public/product_mapping.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
    
found = False
for item in data:
    target_ids = ['4489518', '489518']
    if str(item.get('id')) in target_ids or str(item.get('alias')) in target_ids or str(item.get('dCode')) in target_ids:
        print("Found:", item)
        found = True
        break
        
if not found:
    print("Item 448915 NOT found.")
