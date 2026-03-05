import json

def check_negatives():
    with open('spa/public/employees_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    history = data.get('history', {})
    for sid, recs in history.items():
        negs = [r for r in recs if r[2] < 0]
        if negs:
            print(f"Store {sid} has {len(negs)} negative sales records.")
            print(f"Sample: {negs[0]}")
            # Check Feb 2025 specifically
            feb_negs = [r for r in negs if '2025-02' in r[0]]
            if feb_negs:
                print(f"  Feb 2025 negatives: {len(feb_negs)}")
                print(f"  Sample Feb 2025 negative: {feb_negs[0]}")

if __name__ == "__main__":
    check_negatives()
