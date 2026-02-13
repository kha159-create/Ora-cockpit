import json
import os

filepath = 'spa/public/product_analysis_data.json'
with open(filepath, 'r') as f:
    d = json.load(f)

def print_structure(obj, depth=0, max_depth=3, path=""):
    if depth > max_depth:
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_path = f"{path}.{k}" if path else k
            print(new_path)
            print_structure(v, depth+1, max_depth, new_path)
    elif isinstance(obj, list) and len(obj) > 0:
        print_structure(obj[0], depth+1, max_depth, path)

print("MTD Structure:")
print_structure(d['periods']['mtd'], max_depth=3, path="periods.mtd")

print("\nMissed Opportunities Sample Entry Keys:")
mo = d['periods']['mtd']['missed_opportunities']
if isinstance(mo, dict):
    first_store = list(mo.keys())[0]
    if mo[first_store]:
        print(f"Store {first_store} entry keys:", list(mo[first_store][0].keys()))
elif isinstance(mo, list) and mo:
    print("List entry keys:", list(mo[0].keys()))
