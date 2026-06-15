import sqlite3
import os
import glob
import sys
import librosa
import numpy as np

# Find DB
d1_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\d1\miniflare-D1DatabaseObject"
d1_files = glob.glob(os.path.join(d1_dir, "*.sqlite"))
d1_path = [f for f in d1_files if "metadata" not in f][0]

r2_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\r2\miniflare-R2BucketObject"
r2_files = glob.glob(os.path.join(r2_dir, "*.sqlite"))
r2_path = [f for f in r2_files if "metadata" not in f][0]

blobs_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\r2\pandakey-r2\blobs"

r2_conn = sqlite3.connect(r2_path)
r2_cursor = r2_conn.cursor()
r2_cursor.execute("SELECT key, blob_id FROM _mf_objects")
r2_map = {row[0]: row[1] for row in r2_cursor.fetchall()}
r2_conn.close()

# We know "Back And Forth" is in F minor (4A / 5m), but tag says "9m" (8A / A minor).
# Let's inspect the chromagram of "Back And Forth"
d1_conn = sqlite3.connect(d1_path)
d1_cursor = d1_conn.cursor()
d1_cursor.execute("SELECT file_name, r2_key FROM tracks WHERE file_name LIKE '%Back And Forth%'")
row = d1_cursor.fetchone()
d1_conn.close()

file_name, r2_key = row
blob_id = r2_map.get(r2_key)
blob_file = os.path.join(blobs_dir, blob_id)

y, sr = librosa.load(blob_file, sr=22050, offset=30, duration=30)
chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12, tuning=0.0)
chroma_mean = np.mean(chroma, axis=1)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

print("Chroma mean for 'Back And Forth' (should be F minor):")
for idx, name in enumerate(NOTE_NAMES):
    print(f"  {name:3s}: {chroma_mean[idx]:.4f}")

# Correlate with all minor keys
print("\nCorrelation with minor keys:")
for i in range(12):
    shifted_minor = np.roll(KS_MINOR, i)
    corr = np.corrcoef(chroma_mean, shifted_minor)[0, 1]
    print(f"  {NOTE_NAMES[i]:3s} minor ({CAMELOT_MINOR.get(NOTE_NAMES[i])}): {corr:.4f}")
