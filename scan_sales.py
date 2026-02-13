import json

filepath = 'spa/public/product_analysis_data.json'
with open(filepath, 'r') as f:
    d = json.load(f)

# We are looking for something that links employee_id or employee_name to items sold.
# missed_opportunities has "sold_item" and "employee_id".
# Is there a "sales" or "successful_opportunities" or "transactions" key?

def inspect_keys(obj, path="", depth=0):
    if depth > 4: return
    if isinstance(obj, dict):
        for k in obj.keys():
            # Print keys that look like they might contain lists of items or sales transactions
            if any(x in k.lower() for x in ['items', 'sales', 'trans', 'sold', 'details', 'invoice']):
                print(f"Found candidate key: {path}.{k}")
            
            # Recurse
            if depth < 3:
                inspect_keys(obj[k], f"{path}.{k}" if path else k, depth+1)
    elif isinstance(obj, list) and len(obj) > 0:
        # Check structure of first item
        inspect_keys(obj[0], path, depth+1)

print("Scanning...")
inspect_keys(d)
