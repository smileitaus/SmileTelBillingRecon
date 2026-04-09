#!/bin/bash
# SmileTel Billing Recon — Daily DB Export (Python-based, avoids mysqldump timeout)
set -e
TIMESTAMP=$(date -u +"%Y-%m-%d_%H%M")
DATE_ONLY=$(date -u +"%Y-%m-%d")
REPO_DIR="/home/ubuntu/repo_push"
SNAPSHOT_DIR="${REPO_DIR}/db-snapshots"
SNAPSHOT_FILE="${SNAPSHOT_DIR}/production_${TIMESTAMP}.sql"
LOG_FILE="/home/ubuntu/db_export.log"
PAT_FILE="/home/ubuntu/.github_pat"

echo "[${TIMESTAMP}] Starting DB export..." | tee -a "$LOG_FILE"

# Export using Python script
python3 "${REPO_DIR}/scripts/db_export.py" --output "$SNAPSHOT_FILE" 2>>"$LOG_FILE"

# Update latest symlink
cd "$SNAPSHOT_DIR"
ln -sf "production_${TIMESTAMP}.sql" production_latest.sql

# Prune snapshots older than 7 days
ls -t production_2*.sql 2>/dev/null | tail -n +8 | xargs -r rm -f
KEPT=$(ls production_2*.sql 2>/dev/null | wc -l)
echo "[${TIMESTAMP}] Kept ${KEPT} snapshots" | tee -a "$LOG_FILE"

# Sync codebase and commit
cd "$REPO_DIR"
python3 << 'PYEOF'
import os, shutil
src = "/home/ubuntu/SmileTelBillingRecon"
dst = "/home/ubuntu/repo_push"
ignore_dirs = {".git", "node_modules", ".manus", "dist", ".next", "build"}
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in ignore_dirs]
    rel_root = os.path.relpath(root, src)
    dst_root = os.path.join(dst, rel_root)
    os.makedirs(dst_root, exist_ok=True)
    for f in files:
        shutil.copy2(os.path.join(root, f), os.path.join(dst_root, f))
PYEOF

git add -A
if git diff --cached --quiet; then
  echo "[${TIMESTAMP}] No changes — skipping push" | tee -a "$LOG_FILE"
else
  git -c user.email="angusbs@smileit.com.au" -c user.name="SmileTel Dev" \
    commit -m "chore: daily sync ${DATE_ONLY} — code + DB snapshot (production_${TIMESTAMP}.sql)"
  PAT=$(cat "$PAT_FILE" 2>/dev/null || echo "")
  if [ -n "$PAT" ]; then
    git remote set-url origin "https://x-access-token:${PAT}@github.com/smileitaus/SmileTelBillingRecon.git"
    git push origin main
    echo "[${TIMESTAMP}] Push successful" | tee -a "$LOG_FILE"
  fi
fi
echo "[${TIMESTAMP}] Done" | tee -a "$LOG_FILE"
echo "---" >> "$LOG_FILE"
