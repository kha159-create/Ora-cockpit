import json
import os

path = r"C:\Users\Orange1\Downloads\Compressed\catalog-main\catalog-main\products.json"

try:
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} items.")
    found = []
    for item in data:
        # Check all values
        s = json.dumps(item)
        if "448915" in s:
            found.append(item)
            
    if found:
        print(f"Found {len(found)} items matching 448915:")
        print(json.dumps(found, ensure_ascii=False, indent=2))
    else:
        print("Item NOT found.")
except Exception as e:
    print(f"Error: {e}")
