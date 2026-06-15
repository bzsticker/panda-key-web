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
        bpm_tag = ""
        if hasattr(audio, 'tags') and audio.tags and 'TBPM' in audio.tags: bpm_tag = str(audio.tags['TBPM'])
        if not bpm_tag and 'bpm' in audio: bpm_tag = str(audio['bpm'])
        if bpm_tag:
            dataset.append({"file": blob_file, "name": file_name, "bpm": float(bpm_tag)})
    except Exception:
        pass

def estimate_precise_bpm_highres(y, sr):
    # Downsample to 22050 Hz for speed
    target_sr = 22050
    y_down = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
    
    # Use hop_length=64 for very high resolution (2.9ms per frame)
    hop_length = 64
    
    # Compute onset strength on raw downsampled audio
    onset_env = librosa.onset.onset_strength(y=y_down, sr=target_sr, hop_length=hop_length)
    
    # Estimate rough tempo using librosa's standard tempo function
    rough_tempos = librosa.feature.tempo(onset_envelope=onset_env, sr=target_sr, hop_length=hop_length, start_bpm=120)
    rough_tempo = float(rough_tempos[0] if isinstance(rough_tempos, (np.ndarray, list)) else rough_tempos)
    
    if rough_tempo <= 0.0:
        return 120.0
        
    # Standard DJ range 90-180
    while rough_tempo < 90.0:
        rough_tempo *= 2.0
    while rough_tempo > 180.0:
        rough_tempo /= 2.0
        
    # Autocorrelation to find precise peak
    min_lag = int(round(60.0 * target_sr / (hop_length * 220.0)))
    max_lag = int(round(60.0 * target_sr / (hop_length * 40.0)))
    
    ac = librosa.autocorrelate(onset_env, max_size=max_lag)
    
    # Find rough lag index
    rough_lag = 60.0 * target_sr / (hop_length * rough_tempo)
    rough_lag_idx = int(round(rough_lag))
    
    # Search for peak in a window around rough_lag (+/- 15 lags for high-res hop_length=64)
    search_min = max(min_lag, rough_lag_idx - 15)
    search_max = min(len(ac) - 2, rough_lag_idx + 15)
    
    if search_min >= search_max:
        return rough_tempo
        
    local_slice = ac[search_min:search_max+1]
    local_peak_relative = np.argmax(local_slice)
    peak_idx = search_min + local_peak_relative
    
    # Parabolic interpolation
    if 0 < peak_idx < len(ac) - 1:
        alpha = ac[peak_idx - 1]
        beta = ac[peak_idx]
        gamma = ac[peak_idx + 1]
        denom = alpha - 2 * beta + gamma
        if abs(denom) > 1e-5:
            p = 0.5 * (alpha - gamma) / denom
            p = np.clip(p, -0.5, 0.5)
            interpolated_lag = peak_idx + p
        else:
            interpolated_lag = peak_idx
    else:
        interpolated_lag = peak_idx
        
    precise_bpm = 60.0 * target_sr / (hop_length * interpolated_lag)
    
    # Sanity check: if too far from rough_tempo, fallback to rough_tempo
    if abs(precise_bpm - rough_tempo) > 10.0:
        precise_bpm = rough_tempo
        
    return precise_bpm

print(f"Testing high-res BPM estimation on {len(dataset)} files:")
correct = 0
for item in dataset:
    # Use only 30s to make it fast
    y, sr = librosa.load(item["file"], sr=22050, offset=30, duration=30)
    pred_bpm = estimate_precise_bpm_highres(y, sr)
    rounded = round(pred_bpm)
    ok = (abs(rounded - round(item["bpm"])) <= 1)
    if ok:
        correct += 1
    print(f"Track: {item['name'][:40]} | Target: {item['bpm']} | Predicted: {pred_bpm:.2f} (rounded: {rounded}) | {'[OK]' if ok else '[X]'}")

print(f"High-res BPM Accuracy (within 1 BPM): {correct}/{len(dataset)} ({correct/len(dataset)*100:.1f}%)")
