import sqlite3
import os
import glob
import sys
import librosa
import numpy as np
from mutagen import File as MutagenFile

sys.stdout.reconfigure(encoding='utf-8')

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

d1_conn = sqlite3.connect(d1_path)
d1_cursor = d1_conn.cursor()
d1_cursor.execute("SELECT id, file_name, r2_key FROM tracks")
tracks = d1_cursor.fetchall()
d1_conn.close()

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

def estimate_key_cqt_no_tuning(y, sr):
    # pass tuning=0.0 explicitly
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12, tuning=0.0)
    chroma_mean = np.mean(chroma, axis=1)
    return chroma_mean

def estimate_key_cens(y, sr):
    chroma = librosa.feature.chroma_cens(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    return chroma_mean

def get_camelot(key, mode):
    if mode == "major":
        return CAMELOT_MAJOR.get(key, "8B")
    else:
        return CAMELOT_MINOR.get(key, "8A")

def find_key(chroma_mean, shift=0):
    # Shift chromagram
    chroma_shifted = np.roll(chroma_mean, shift)
    
    best_corr = -1
    best_key = "C"
    best_mode = "major"
    
    for i in range(12):
        shifted_major = np.roll(KS_MAJOR, i)
        shifted_minor = np.roll(KS_MINOR, i)
        
        corr_major = np.corrcoef(chroma_shifted, shifted_major)[0, 1]
        corr_minor = np.corrcoef(chroma_shifted, shifted_minor)[0, 1]
        
        if corr_major > best_corr:
            best_corr = corr_major
            best_key = NOTE_NAMES[i]
            best_mode = "major"
            
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = NOTE_NAMES[i]
            best_mode = "minor"
            
    return get_camelot(best_key, best_mode)

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
                dataset.append({"file": blob_file, "name": file_name, "camelot": target_camelot})
    except Exception:
        pass

print("Comparing CQT with tuning=0.0 vs Cens with shifts:")
correct_cqt_no_shift = 0
correct_cqt_shift4 = 0
correct_cens_shift4 = 0

for item in dataset:
    y, sr = librosa.load(item["file"], sr=22050, offset=30, duration=30)
    
    # CQT no tuning
    cqt_mean = estimate_key_cqt_no_tuning(y, sr)
    cqt_no_shift = find_key(cqt_mean, shift=0)
    cqt_shift4 = find_key(cqt_mean, shift=4) # Shift chroma by +4 semitones
    
    # CENS
    cens_mean = estimate_key_cens(y, sr)
    cens_shift4 = find_key(cens_mean, shift=4)
    
    if cqt_no_shift == item["camelot"]: correct_cqt_no_shift += 1
    if cqt_shift4 == item["camelot"]: correct_cqt_shift4 += 1
    if cens_shift4 == item["camelot"]: correct_cens_shift4 += 1
    
    print(f"\nTrack: {item['name'][:40]} | Target: {item['camelot']}")
    print(f"  CQT (tuning=0.0, shift=0): {cqt_no_shift} | {'[OK]' if cqt_no_shift == item['camelot'] else '[X]'}")
    print(f"  CQT (tuning=0.0, shift=4): {cqt_shift4} | {'[OK]' if cqt_shift4 == item['camelot'] else '[X]'}")
    print(f"  CENS (shift=4)           : {cens_shift4} | {'[OK]' if cens_shift4 == item['camelot'] else '[X]'}")

print(f"\nCQT (shift=0) Accuracy: {correct_cqt_no_shift}/{len(dataset)} ({correct_cqt_no_shift/len(dataset)*100:.1f}%)")
print(f"CQT (shift=4) Accuracy: {correct_cqt_shift4}/{len(dataset)} ({correct_cqt_shift4/len(dataset)*100:.1f}%)")
print(f"CENS (shift=4) Accuracy: {correct_cens_shift4}/{len(dataset)} ({correct_cens_shift4/len(dataset)*100:.1f}%)")
