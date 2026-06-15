import sqlite3
import os
import glob
import sys
import librosa
import numpy as np
from mutagen import File as MutagenFile

sys.stdout.reconfigure(encoding='utf-8')

# Find D1 database file
d1_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\d1\miniflare-D1DatabaseObject"
d1_files = glob.glob(os.path.join(d1_dir, "*.sqlite"))
d1_path = [f for f in d1_files if "metadata" not in f][0]

# Find R2 database file
r2_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\r2\miniflare-R2BucketObject"
r2_files = glob.glob(os.path.join(r2_dir, "*.sqlite"))
r2_path = [f for f in r2_files if "metadata" not in f][0]

blobs_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\r2\pandakey-r2\blobs"

r2_conn = sqlite3.connect(r2_path)
r2_cursor = r2_conn.cursor()
r2_cursor.execute("SELECT key, blob_id FROM _mf_objects")
r2_map = {row[0]: row[1] for row in r2_cursor.fetchall()}
r2_conn.close()

d1_conn = sqlite3.connect(d1_path)
d1_cursor = d1_conn.cursor()
d1_cursor.execute("SELECT id, file_name, r2_key FROM tracks")
tracks = d1_cursor.fetchall()
d1_conn.close()

OPEN_KEY_TO_CAMELOT = {
    '1d': '12B', '2d': '1B', '3d': '2B', '4d': '3B', '5d': '4B', '6d': '5B', '7d': '6B', '8d': '7B', '9d': '8B', '10d': '9B', '11d': '10B', '12d': '11B',
    '1m': '12A', '2m': '1A', '3m': '2A', '4m': '3A', '5m': '4A', '6m': '5A', '7m': '6A', '8m': '7A', '9m': '8A', '10m': '9A', '11m': '10A', '12m': '11A'
}

dataset = []
for t in tracks:
    track_id, file_name, r2_key = t
    blob_id = r2_map.get(r2_key)
    blob_file = os.path.join(blobs_dir, blob_id) if blob_id else None
    if not blob_file or not os.path.exists(blob_file):
        continue
    try:
        audio = MutagenFile(blob_file)
        if audio is None:
            continue
        bpm_tag, key_tag = "", ""
        if hasattr(audio, 'tags') and audio.tags:
            if 'TBPM' in audio.tags: bpm_tag = str(audio.tags['TBPM'])
            if 'TKEY' in audio.tags: key_tag = str(audio.tags['TKEY'])
        if not bpm_tag and 'bpm' in audio: bpm_tag = str(audio['bpm'])
        if not key_tag and 'key' in audio: key_tag = str(audio['key'])
        
        if bpm_tag and key_tag:
            target_camelot = OPEN_KEY_TO_CAMELOT.get(key_tag.strip())
            if target_camelot:
                dataset.append({
                    "file": blob_file,
                    "name": file_name,
                    "bpm": float(bpm_tag)
                })
    except Exception:
        pass

print(f"Testing standard beat_track on {len(dataset)} files:")
correct = 0

for item in dataset:
    # Load 60s from the middle at full sr=44100
    y, sr = librosa.load(item["file"], sr=44100, offset=30, duration=60)
    
    # 1. Standard beat_track
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo[0] if isinstance(tempo, (np.ndarray, list)) else tempo)
    
    # Standard DJ range 90-180
    while bpm < 90.0:
        bpm *= 2.0
    while bpm > 180.0:
        bpm /= 2.0
        
    rounded_bpm = round(bpm)
    
    # Check if within 1.0 of target
    ok = (abs(rounded_bpm - round(item["bpm"])) <= 1)
    if ok:
        correct += 1
    
    print(f"Track: {item['name'][:40]} | Target: {item['bpm']} | Predicted: {rounded_bpm} | {'[OK]' if ok else '[X]'}")

print(f"BPM Accuracy (within 1 BPM): {correct}/{len(dataset)} ({correct/len(dataset)*100:.1f}%)")
