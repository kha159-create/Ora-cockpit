
import json
import sys
import os

def check_history_structure():
    file_path = 'public/product_analysis_data.json'
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        history = data.get('product_daily_history', {})
        if not history:
            print("No product_daily_history found.")
            return

        # Check first item history
        first_key = list(history.keys())[0]
        records = history[first_key]
        
        print(f"Checking item: {first_key}")
        print(f"Record count: {len(records)}")
        
        if len(records) > 0:
            sample = records[0]
            print("Sample record keys:", list(sample.keys()))
            print("Sample record:", json.dumps(sample, ensure_ascii=False))
            
            # Check for specific keys
            has_emp = 'employee_name' in sample or 'emp_name' in sample or 'employee' in sample
            has_store = 'store_id' in sample or 'store_name' in sample or 'store' in sample
            print(f"Has Employee Info: {has_emp}")
            print(f"Has Store Info: {has_store}")
        else:
            print("Records array is empty.")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_history_structure()
