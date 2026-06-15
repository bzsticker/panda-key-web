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

# Key profiles
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

CAMELOT_MAJOR = {
    'C': '8B', 'C#': '3B', 'Db': '3B', 'D': '10B', 'D#': '5B', 'Eb': '5B', 'E': '12B', 'F': '7B',
    'F#': '2B', 'Gb': '2B', 'G': '9B', 'G#': '4B', 'Ab': '4B', 'A': '11B', 'A#': '6B', 'Bb': '6B', 'B': '1B'
}
CAMELOT_MINOR = {
    'C': '5A', 'C#': '12A', 'Db': '12A', 'D': '7A', 'D#': '2A', 'Eb': '2A', 'E': '9A', 'F': '4A',
    'F#': '11A', 'Gb': '11A', 'G': '6A', 'G#': '1A', 'Ab': '1A', 'A': '8A', 'A#': '3A', 'Bb': '3A', 'B': '10A'
}

OPEN_KEY_TO_CAMELOT = {
    '1d': '12B', '2d': '1B', '3d': '2B', '4d': '3B', '5d': '4B', '6d': '5B', '7d': '6B', '8d': '7B', '9d': '8B', '10d': '9B', '11d': '10B', '12d': '11B',
    '1m': '12A', '2m': '1A', '3m': '2A', '4m': '3A', '5m': '4A', '6m': '5A', '7m': '6A', '8m': '7A', '9m': '8A', '10m': '9A', '11m': '10A', '12m': '11A'
}
CAMELOT_TO_OPEN_KEY = {v: k for k, v in OPEN_KEY_TO_CAMELOT.items()}

def estimate_bpm_new(y, sr):
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(tempo[0] if isinstance(tempo, (np.ndarray, list)) else tempo)
    
    # Standard DJ range 90-180
    while bpm < 90.0:
        bpm *= 2.0
    while bpm > 180.0:
        bpm /= 2.0
        
    return round(bpm)

def estimate_key_new(y, sr):
    # Use chroma_cqt with default tuning estimation
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12)
    chroma_mean = np.mean(chroma, axis=1)
    
    best_corr = -1
    best_key = "C"
    best_mode = "major"
    
    for i in range(12):
        shifted_major = np.roll(KS_MAJOR, i)
        shifted_minor = np.roll(KS_MINOR, i)
        
        corr_major = np.corrcoef(chroma_mean, shifted_major)[0, 1]
        corr_minor = np.corrcoef(chroma_mean, shifted_minor)[0, 1]
        
        if corr_major > best_corr:
            best_corr = corr_major
            best_key = NOTE_NAMES[i]
            best_mode = "major"
            
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = NOTE_NAMES[i]
            best_mode = "minor"
            
    if best_mode == "major":
        camelot = CAMELOT_MAJOR.get(best_key, "8B")
        musical = best_key
    else:
        camelot = CAMELOT_MINOR.get(best_key, "8A")
        musical = best_key + "m"
        
    return musical, camelot

# Gather ground truth
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
                    "bpm": float(bpm_tag),
                    "camelot": target_camelot
                })
    except Exception:
        pass

print(f"Testing new BPM and Key detection on {len(dataset)} files:")
correct_bpm = 0
correct_key = 0

for item in dataset:
    # Load 60s from the middle to be very robust
    y, sr = librosa.load(item["file"], sr=22050, offset=30, duration=60)
    
    pred_bpm = estimate_bpm_new(y, sr)
    mus, pred_cam = estimate_key_new(y, sr)
    
    bpm_ok = (pred_bpm == round(item["bpm"]))
    key_ok = (pred_cam == item["camelot"])
    
    if bpm_ok: correct_bpm += 1
    if key_ok: correct_key += 1
    
    print(f"\nTrack: {item['name'][:40]}")
    print(f"  BPM -> Target: {item['bpm']} | Predicted: {pred_bpm} | {'[OK]' if bpm_ok else '[X]'}")
    print(f"  Key -> Target: {item['camelot']} ({CAMELOT_TO_OPEN_KEY[item['camelot']]}) | Predicted: {pred_cam} ({CAMELOT_TO_OPEN_KEY.get(pred_cam)}) | {'[OK]' if key_ok else '[X]'}")

print(f"\nBPM Accuracy: {correct_bpm}/{len(dataset)} ({correct_bpm/len(dataset)*100:.1f}%)")
print(f"Key Accuracy: {correct_key}/{len(dataset)} ({correct_key/len(dataset)*100:.1f}%)")
