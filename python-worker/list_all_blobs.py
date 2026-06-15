import sqlite3
import os
import glob
import sys

sys.stdout.reconfigure(encoding='utf-8')

r2_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\r2\miniflare-R2BucketObject"
r2_files = glob.glob(os.path.join(r2_dir, "*.sqlite"))
r2_path = [f for f in r2_files if "metadata" not in f][0]

r2_conn = sqlite3.connect(r2_path)
r2_cursor = r2_conn.cursor()
r2_cursor.execute("SELECT key, blob_id, size FROM _mf_objects")
rows = r2_cursor.fetchall()
r2_conn.close()

print(f"Total objects in R2: {len(rows)}")
for idx, row in enumerate(rows):
    key, blob_id, size = row
    print(f"{idx+1:02d}. Key: {repr(key)} | Blob: {blob_id} | Size: {size}")
