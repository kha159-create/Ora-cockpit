import json
import os

file_path = 'product_analysis_data.json'

if not os.path.exists(file_path):
    print(f"File not found: {file_path}")
    exit(1)

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        # Load only partial if possible? No, standard json load loads all. 
        # 50MB is fine for python memory.
        data = json.load(f)
        
    print("Top level keys:", list(data.keys()))
    
    if 'periods' in data:
        print("Periods keys:", list(data['periods'].keys()))
        if 'mtd' in data['periods']:
            mtd = data['periods']['mtd']
            print("MTD keys:", list(mtd.keys()))
            if 'employee_sales' in mtd:
                print("employee_sales is present in MTD.")
                emp_sales = mtd['employee_sales']
                print("Number of employees in sales:", len(emp_sales))
                # Print first key and value summary
                if len(emp_sales) > 0:
                    first_emp = list(emp_sales.keys())[0]
                    print(f"Sample Employee ID: {first_emp}")
                    print(f"Sample Data: {str(emp_sales[first_emp])[:200]}...")
            else:
                print("employee_sales NOT found in MTD.")
        else:
            print("mtd NOT found in periods.")
    else:
        print("periods NOT found in root.")

except Exception as e:
    print(f"Error: {e}")
