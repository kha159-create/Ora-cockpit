---
description: Safe way to synchronize local changes with remote updates (automated data syncs)
---

# Git Synchronization Workflow

Follow these steps to safely pull remote updates and push your local changes without losing data or running into messy conflict states. This is especially important for projects with automated background tasks (like data syncs).

### 1. Fetch Remote Changes
Always fetch first to see what has changed on the server.
```bash
git fetch origin
```

### 2. Merge Remote Changes
Use a standard merge. This is safer than rebase when dealing with automated commits.
```bash
git merge origin/main
```

### 3. Handle Data Conflicts (JSON files)
If you see conflicts in `employees_data.json`, `management_data.json`, or `offers_data.json`, prioritize the remote version to ensure you have the latest data.

**Run these commands:**
```bash
# 1. Take remote version for data files
git checkout --theirs employees_data.json management_data.json offers_data.json spa/public/employees_data.json spa/public/management_data.json spa/public/offers_data.json

# 2. Stage the resolved files
git add employees_data.json management_data.json offers_data.json spa/public/employees_data.json spa/public/management_data.json spa/public/offers_data.json

# 3. Complete the merge commit
git commit -m "Merge remote updates and keep latest data files"
```

### 4. Verify Local Build
Always run a quick check before pushing.
```bash
cd spa
npm run dev
```

### 5. Final Push
Once satisfied, push your combined changes.
```bash
git push
```
