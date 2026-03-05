import json
import os

def debug():
    json_path = 'spa/public/management_data.json'
    if not os.path.exists(json_path):
        print(f"File not found: {json_path}")
        return

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    sales = data.get('sales', [])
    stores = data.get('stores', {})

    # Target: March 1 - March 5, 2026
    target_start = "2026-03-01"
    target_end = "2026-03-05"

    # LY Shifted (Hijri Alignment for Sha'ban):
    # 2026-03-01 is 11 Sha'ban 1447 -> 11 Sha'ban 1446 was 2025-02-10
    # 2026-03-05 is 15 Sha'ban 1447 -> 15 Sha'ban 1446 was 2025-02-14
    ly_shifted_start = "2025-02-10"
    ly_shifted_end = "2025-02-14"

    # LY Gregorian:
    ly_greg_start = "2025-03-01"
    ly_greg_end = "2025-03-05"

    results = {}
    for r in sales:
        dt = r[0][:10]
        sid = r[1]
        val = r[2]

        if sid not in results:
            results[sid] = {"mtd": 0, "ly_shifted": 0, "ly_greg": 0}

        if target_start <= dt <= target_end:
            results[sid]["mtd"] += val
        elif ly_shifted_start <= dt <= ly_shifted_end:
            results[sid]["ly_shifted"] += val
        elif ly_greg_start <= dt <= ly_greg_end:
            results[sid]["ly_greg"] += val

    # Print top 5 stores by MTD sales
    sorted_sids = sorted(results.keys(), key=lambda x: results[x]["mtd"], reverse=True)
    
    print(f"{'Store Name':<30} | {'MTD 2026':>10} | {'LY Shifted':>10} | {'LY Greg':>10}")
    print("-" * 75)
    for sid in sorted_sids[:10]:
        name = stores.get(sid, sid)
        r = results[sid]
        print(f"{name[:30]:<30} | {r['mtd']:10.0f} | {r['ly_shifted']:10.0f} | {r['ly_greg']:10.0f}")

if __name__ == "__main__":
    debug()
