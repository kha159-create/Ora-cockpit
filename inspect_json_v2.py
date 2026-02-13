import json
import os

def inspect_file(file_path):
    print(f"--- Inspecting {file_path} ---")
    if not os.path.exists(file_path):
        print("File not found.")
        return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        print("Top level keys:", list(data.keys()))
        
        if file_path.endswith('product_analysis_data.json'):
            if 'periods' in data:
                print("Periods:", list(data['periods'].keys()))
                if 'mtd' in data['periods']:
                    mtd = data['periods']['mtd']
                    print("MTD keys:", list(mtd.keys()))
                    
        if file_path.endswith('employees_data.json'):
             # Check for any item-level data
            if 'history' in data:
                print("History found (likely daily totals).")
                # Sample one
                first_store = list(data['history'].keys())[0]
                print(f"Sample history entry for store {first_store}: {data['history'][first_store][0]}")

    except Exception as e:
        print(f"Error: {e}")

inspect_file('product_analysis_data.json')
inspect_file('employees_data.json')
