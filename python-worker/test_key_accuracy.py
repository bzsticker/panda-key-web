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

# Sha'ath Key Profiles
SHA_MAJOR = np.array([7.239, 3.504, 3.584, 2.845, 5.819, 4.559, 2.448, 6.995, 3.391, 4.556, 4.074, 4.459])
SHA_MINOR = np.array([7.151, 2.524, 3.548, 7.200, 3.391, 3.840, 2.502, 7.027, 3.493, 3.012, 2.428, 3.473])

# Krumhansl-Schmuckler (K-S) profiles
KS_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Temperley profiles
TEMP_MAJOR = np.array([5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0])
TEMP_MINOR = np.array([5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0])

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

def analyze_chroma(chroma_mean, major_profile, minor_profile):
    best_corr = -1
    best_key = "C"
    best_mode = "major"
    for i in range(12):
        shifted_major = np.roll(major_profile, i)
        shifted_minor = np.roll(minor_profile, i)
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
    else:
        camelot = CAMELOT_MINOR.get(best_key, "8A")
    return camelot

# Gather ground truth from ID3 tags
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
            # Parse key tag (e.g. "9m", "10d") to Camelot key
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

print(f"Loaded {len(dataset)} tracks with ground truth tags.")

methods = [
    # (Name, function)
    ("1. CQT + Sha'ath (Current)", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cqt(y=librosa.effects.harmonic(librosa.resample(y, orig_sr=sr, target_sr=22050)), sr=22050, bins_per_octave=36), axis=1), SHA_MAJOR, SHA_MINOR)),
    ("2. CQT + K-S", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cqt(y=librosa.effects.harmonic(librosa.resample(y, orig_sr=sr, target_sr=22050)), sr=22050, bins_per_octave=36), axis=1), KS_MAJOR, KS_MINOR)),
    ("3. CQT + Temperley", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cqt(y=librosa.effects.harmonic(librosa.resample(y, orig_sr=sr, target_sr=22050)), sr=22050, bins_per_octave=36), axis=1), TEMP_MAJOR, TEMP_MINOR)),
    ("4. CENS + Sha'ath (No Harmonic Sep)", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cens(y=librosa.resample(y, orig_sr=sr, target_sr=22050), sr=22050), axis=1), SHA_MAJOR, SHA_MINOR)),
    ("5. CENS + K-S (No Harmonic Sep)", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cens(y=librosa.resample(y, orig_sr=sr, target_sr=22050), sr=22050), axis=1), KS_MAJOR, KS_MINOR)),
    ("6. CENS + Temperley (Harmonic Sep)", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cens(y=librosa.effects.harmonic(librosa.resample(y, orig_sr=sr, target_sr=22050)), sr=22050), axis=1), TEMP_MAJOR, TEMP_MINOR)),
    ("7. CQT (n_chroma=12, default) + KS", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cqt(y=librosa.effects.harmonic(librosa.resample(y, orig_sr=sr, target_sr=22050)), sr=22050), axis=1), KS_MAJOR, KS_MINOR)),
    ("8. CQT (n_chroma=12, default) + Temperley", lambda y, sr: analyze_chroma(np.mean(librosa.feature.chroma_cqt(y=librosa.effects.harmonic(librosa.resample(y, orig_sr=sr, target_sr=22050)), sr=22050), axis=1), TEMP_MAJOR, TEMP_MINOR)),
]

results = {name: 0 for name, _ in methods}

for data in dataset:
    y, sr = librosa.load(data["file"], sr=22050) # load directly at 22050 to speed up
    print(f"\nTrack: {data['name'][:50]} | Target Key: {data['camelot']}")
    for name, fn in methods:
        try:
            pred = fn(y, sr)
            is_correct = (pred == data["camelot"])
            if is_correct:
                results[name] += 1
            print(f"  {name}: {pred} {'[CORRECT]' if is_correct else '[WRONG]'}")
        except Exception as e:
            print(f"  {name}: Error {e}")

print("\n--- Key Accuracy Summary ---")
for name, correct in results.items():
    pct = (correct / len(dataset)) * 100 if dataset else 0
    print(f"{name}: {correct}/{len(dataset)} ({pct:.1f}%)")
