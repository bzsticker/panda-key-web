# python-worker/main.py
import os
import re
import tempfile
import requests
from typing import Optional, Dict, Any
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
import librosa
import numpy as np
from mutagen import File as MutagenFile
# pyrefly: ignore [missing-import]
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4, MP4Cover
from mutagen.id3 import APIC
import base64
from io import BytesIO
from PIL import Image

load_dotenv()

app = FastAPI(title="Panda Key Audio Worker")

# Configurations
WORKER_API_URL = os.getenv("WORKER_API_URL", "http://localhost:3000")
API_SECRET = os.getenv("API_SECRET", "pandakey_super_secret_token_123!")

# Note Names & Key Profile Definitions
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
# Krumhansl-Schmuckler (K-S) key profiles
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

CAMELOT_MAJOR = {
    'C': '8B', 'C#': '3B', 'Db': '3B', 'D': '10B', 'D#': '5B', 'Eb': '5B', 'E': '12B', 'F': '7B',
    'F#': '2B', 'Gb': '2B', 'G': '9B', 'G#': '4B', 'Ab': '4B', 'A': '11B', 'A#': '6B', 'Bb': '6B', 'B': '1B'
}
CAMELOT_MINOR = {
    'C': '5A', 'C#': '12A', 'Db': '12A', 'D': '7A', 'D#': '2A', 'Eb': '2A', 'E': '9A', 'F': '4A',
    'F#': '11A', 'Gb': '11A', 'G': '6A', 'G#': '1A', 'Ab': '1A', 'A': '8A', 'A#': '3A', 'Bb': '3A', 'B': '10A'
}

CAMELOT_TO_MUSICAL = {
    '1A': 'Abm', '2A': 'Ebm', '3A': 'Bbm', '4A': 'Fm', '5A': 'Cm', '6A': 'Gm', '7A': 'Dm', '8A': 'Am', '9A': 'Em', '10A': 'Bm', '11A': 'F#m', '12A': 'Dbm',
    '1B': 'B', '2B': 'F#', '3B': 'Db', '4B': 'Ab', '5B': 'Eb', '6B': 'Bb', '7B': 'F', '8B': 'C', '9B': 'G', '10B': 'D', '11B': 'A', '12B': 'E'
}
MUSICAL_TO_CAMELOT = {v: k for k, v in CAMELOT_TO_MUSICAL.items()}
MUSICAL_ALIASES = {
    'A#m': 'Bbm', 'C#m': 'Dbm', 'D#m': 'Ebm', 'F#m': 'F#m', 'G#m': 'Abm',
    'A#': 'Bb', 'C#': 'Db', 'D#': 'Eb', 'F#': 'F#', 'G#': 'Ab',
    'Gb': 'F#', 'Db': 'Db', 'Ab': 'Ab', 'Eb': 'Eb', 'Bb': 'Bb'
}
OPEN_KEY_TO_CAMELOT = {
    '1d': '12B', '2d': '1B', '3d': '2B', '4d': '3B', '5d': '4B', '6d': '5B', '7d': '6B', '8d': '7B', '9d': '8B', '10d': '9B', '11d': '10B', '12d': '11B',
    '1m': '12A', '2m': '1A', '3m': '2A', '4m': '3A', '5m': '4A', '6m': '5A', '7m': '6A', '8m': '7A', '9m': '8A', '10m': '9A', '11m': '10A', '12m': '11A'
}

def normalize_tag_key(tag_key: str):
    if not tag_key:
        return None, None
    tag_key = tag_key.strip()
    if re.match(r'^\d{1,2}[AB]$', tag_key):
        cam = tag_key
        mus = CAMELOT_TO_MUSICAL.get(cam)
        return mus, cam
    if re.match(r'^\d{1,2}[md]$', tag_key):
        cam = OPEN_KEY_TO_CAMELOT.get(tag_key)
        if cam:
            mus = CAMELOT_TO_MUSICAL.get(cam)
            return mus, cam
    mus_clean = tag_key
    is_minor = False
    if mus_clean.endswith('min') or mus_clean.endswith('minor'):
        is_minor = True
        mus_clean = mus_clean.replace('min', '').replace('minor', '').strip()
    elif mus_clean.endswith('m') and len(mus_clean) > 1:
        is_minor = True
        mus_clean = mus_clean[:-1].strip()
    mus_clean = MUSICAL_ALIASES.get(mus_clean, mus_clean)
    mus_normalized = mus_clean + ("m" if is_minor else "")
    cam = MUSICAL_TO_CAMELOT.get(mus_normalized)
    if cam:
        return mus_normalized, cam
    alias_normalized = MUSICAL_ALIASES.get(mus_normalized)
    if alias_normalized:
        cam = MUSICAL_TO_CAMELOT.get(alias_normalized)
        if cam:
            return alias_normalized, cam
    return None, None

class AnalysisRequest(BaseModel):
    track_id: str
    job_id: str
    user_id: str
    r2_key: str
    file_name: str
    download_url: str

class WriteTagsRequest(BaseModel):
    track_id: str
    job_id: str
    user_id: str
    r2_key: str
    file_name: str
    download_url: str
    metadata: Dict[str, Any]

def update_job_status(job_id: str, progress: int, current_step: str, status: str = "running", error_message: str = ""):
    try:
        url = f"{WORKER_API_URL}/api/analysis/jobs/{job_id}"
        headers = {"Authorization": f"Bearer {API_SECRET}"}
        payload = {
            "status": status,
            "progress": progress,
            "current_step": current_step,
            "error_message": error_message
        }
        res = requests.patch(url, json=payload, headers=headers)
        res.raise_for_status()
    except Exception as e:
        print(f"Failed to update job status: {e}")

def update_track_metadata(track_id: str, metadata: Dict[str, Any]):
    try:
        url = f"{WORKER_API_URL}/api/tracks/{track_id}"
        headers = {"Authorization": f"Bearer {API_SECRET}"}
        res = requests.patch(url, json=metadata, headers=headers)
        res.raise_for_status()
    except Exception as e:
        print(f"Failed to update track metadata: {e}")

def get_tag_value(audio, keys):
    for k in keys:
        if k in audio:
            val = audio[k]
            if isinstance(val, list) and len(val) > 0:
                return str(val[0])
            return str(val)
    return ""

def extract_cover_art(file_path):
    try:
        audio = MutagenFile(file_path)
        if audio is None:
            return None
        
        image_data = None
        mime = "image/jpeg" # default
        
        # 1. MP3
        if isinstance(audio, MP3) and audio.tags:
            for tag in audio.tags.values():
                if isinstance(tag, APIC):
                    image_data = tag.data
                    mime = tag.mime
                    break
        # 2. FLAC
        elif isinstance(audio, FLAC):
            if audio.pictures:
                image_data = audio.pictures[0].data
                mime = audio.pictures[0].mime
        # 3. MP4 / M4A
        elif isinstance(audio, MP4):
            if 'covr' in audio:
                covr = audio['covr']
                if covr and len(covr) > 0:
                    image_data = covr[0]
                    if isinstance(image_data, MP4Cover):
                        if image_data.imageformat == MP4Cover.FORMAT_PNG:
                            mime = "image/png"
                        else:
                            mime = "image/jpeg"
        # 4. Fallback check for any Mutagen ID3 keys (e.g. AIFF, WAV using ID3)
        if not image_data and hasattr(audio, 'tags') and audio.tags:
            for tag in audio.tags.values():
                if tag.__class__.__name__ == 'APIC':
                    image_data = tag.data
                    mime = getattr(tag, 'mime', 'image/jpeg')
                    break
                    
        if image_data:
            try:
                # Resize and compress using Pillow
                img = Image.open(BytesIO(image_data))
                if img.mode in ("RGBA", "P", "LA") or (img.mode == "CMYK"):
                    img = img.convert("RGB")
                
                max_size = (300, 300)
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
                
                output = BytesIO()
                img.save(output, format="JPEG", quality=80)
                image_data = output.getvalue()
                mime = "image/jpeg"
            except Exception as resize_err:
                print(f"Failed to resize cover image: {resize_err}")
                
            b64 = base64.b64encode(image_data).decode('utf-8')
            return f"data:{mime};base64,{b64}"
            
    except Exception as e:
        print(f"Error extracting cover art: {e}")
        
    return None


def estimate_precise_bpm(y, sr):
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


def estimate_key(y, sr):
    # Downsample to 22050 Hz to keep mid-to-high frequency harmonics (perfect for key analysis)
    target_sr = 22050
    y_down = librosa.resample(y, orig_sr=sr, target_sr=target_sr)
    
    # Separate harmonic component to remove percussion noise for more accurate key detection
    y_harmonic = librosa.effects.harmonic(y_down)
    
    # Chroma energy computation with higher frequency resolution (36 bins/octave mapped to 12 chroma)
    # Explicitly set tuning=0.0 to prevent librosa from attempting automatic tuning estimation
    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=target_sr, bins_per_octave=36, tuning=0.0)
    chroma_mean = np.mean(chroma, axis=1)
    
    best_corr = -1
    best_key = "C"
    best_mode = "major"
    
    for i in range(12):
        shifted_major = np.roll(MAJOR_PROFILE, i)
        shifted_minor = np.roll(MINOR_PROFILE, i)
        
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

def run_audio_analysis(req: AnalysisRequest):
    temp_file_path = None
    try:
        # Step 1: Download file
        update_job_status(req.job_id, 10, "ดาวน์โหลดไฟล์จาก R2 Storage...")
        res = requests.get(req.download_url, headers={"Authorization": f"Bearer {API_SECRET}"})
        res.raise_for_status()
        
        suffix = os.path.splitext(req.file_name)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(res.content)
            temp_file_path = temp_file.name

        # Step 2: Read tags with mutagen
        update_job_status(req.job_id, 30, "กำลังอ่านแท็กและชื่อเรื่องเพลง...")
        audio = MutagenFile(temp_file_path)
        
        title = get_tag_value(audio, ['TIT2', '\xa9nam', 'TITLE', 'title']) or req.file_name.replace(suffix, "")
        artist = get_tag_value(audio, ['TPE1', '\xa9ART', 'ARTIST', 'artist']) or "Unknown Artist"
        album = get_tag_value(audio, ['TALB', '\xa9alb', 'ALBUM', 'album']) or "Unknown Album"
        genre = get_tag_value(audio, ['TCON', '\xa9gen', 'GENRE', 'genre']) or "Unknown Genre"
        year_str = get_tag_value(audio, ['TYER', 'TDRC', '\xa9day', 'DATE', 'date', 'year'])
        comments = get_tag_value(audio, ['COMM', '\xa9cmt', 'COMMENT', 'comment'])

        # Extract cover art
        print("[Worker] Extracting cover art...")
        cover_art_base64 = extract_cover_art(temp_file_path)

        year = None
        if year_str:
            m = re.search(r'\d{4}', year_str)
            if m:
                year = int(m.group(0))

        # Get duration using mutagen as primary source for faster speed
        duration = 0.0
        if audio is not None and hasattr(audio, 'info') and audio.info is not None:
            duration = getattr(audio.info, 'length', 0.0)
            print(f"[Worker] Audio duration from mutagen: {duration} seconds")

        # Extract existing metadata tags for BPM and Key if they exist (Rekordbox/Serato/Traktor)
        tag_bpm_str = get_tag_value(audio, ['TBPM', 'bpm', 'tempo', 'tmpo'])
        tag_bpm = None
        if tag_bpm_str:
            try:
                m_bpm = re.search(r'\d+(\.\d+)?', tag_bpm_str)
                if m_bpm:
                    tag_bpm = float(m_bpm.group(0))
                    print(f"[Worker] Extracted BPM tag: {tag_bpm}")
            except Exception:
                pass

        tag_key_str = get_tag_value(audio, ['TKEY', 'initialkey', 'KEY', 'key', '----:com.apple.iTunes:initialkey'])
        tag_mus_key, tag_cam_key = None, None
        if tag_key_str:
            tag_mus_key, tag_cam_key = normalize_tag_key(tag_key_str)
            if tag_cam_key:
                print(f"[Worker] Extracted Key tag: {tag_mus_key} ({tag_cam_key})")

        # Step 3: Load audio with librosa (middle 60-second segment at 22050 Hz)
        print(f"[Worker] Loading audio file (middle 60s at 22050 Hz): {temp_file_path}")
        update_job_status(req.job_id, 50, "กำลังโหลดและแปลงข้อมูลเสียงเพลง...")
        
        sr_target = 22050
        if duration > 60.0:
            offset = (duration - 60.0) / 2.0
            y, sr = librosa.load(temp_file_path, sr=sr_target, offset=offset, duration=60.0)
        else:
            y, sr = librosa.load(temp_file_path, sr=sr_target)
            
        print(f"[Worker] Audio loaded. Sample rate: {sr}, shape: {y.shape}")
        
        # If duration was not parsed correctly from mutagen, fallback to librosa duration
        if duration <= 0.0:
            duration = float(librosa.get_duration(y=y, sr=sr))
            print(f"[Worker] Fallback duration calculated: {duration} seconds")

        # Calculate advanced energy score (1-10) using multiple signal features
        print("[Worker] Calculating advanced energy score components...")
        update_job_status(req.job_id, 60, "กำลังวิเคราะห์ระดับความแรงและโครงสร้างพลังงานเสียง...")

        rms = librosa.feature.rms(y=y)
        mean_rms = float(np.mean(rms))

        # 1. Loudness (L) - Wide scale (-26 dB to -4 dB)
        loudness_db = 20 * np.log10(mean_rms + 1e-6)
        L = np.clip((loudness_db - (-26.0)) / (-4.0 - (-26.0)), 0.0, 1.0)

        # Estimate/Read BPM first
        bpm = 0
        if tag_bpm is not None and tag_bpm > 0:
            bpm = int(round(tag_bpm))
            print(f"[Worker] Using existing BPM from tag: {bpm}")
        else:
            if duration < 3.0 or mean_rms < 0.0001:
                bpm = 120
            else:
                print("[Worker] Estimating BPM...")
                bpm = int(round(estimate_precise_bpm(y, sr)))
                print(f"[Worker] Estimated BPM: {bpm}")

        # 2. Beat Strength (B) - Wide scale (0.5 to 8.0)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        try:
            tempo_detected, beats = librosa.beat.beat_track(y=y, sr=sr, start_bpm=bpm)
        except Exception:
            beats = []
            
        if len(beats) > 0:
            beat_strength = float(np.mean(onset_env[beats]))
        else:
            beat_strength = float(np.mean(onset_env))
        B = np.clip((beat_strength - 0.5) / (8.0 - 0.5), 0.0, 1.0)

        # 3. Onset Density (O) - Wide scale (0.5 to 6.5)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        segment_duration = len(y) / sr
        onset_rate = len(onsets) / (segment_duration if segment_duration > 0 else 1.0)
        O = np.clip((onset_rate - 0.5) / (6.5 - 0.5), 0.0, 1.0)

        # 4. Bass Energy (F) - Wide scale (0.5 to 50.0)
        stft = np.abs(librosa.stft(y))
        frequencies = librosa.fft_frequencies(sr=sr)
        bass_bins = frequencies < 150
        if np.any(bass_bins):
            bass_energy = float(np.mean(stft[bass_bins, :]))
        else:
            bass_energy = 0.0
        F = np.clip((bass_energy - 0.5) / (50.0 - 0.5), 0.0, 1.0)

        # 5. Spectral Brightness (S) - Calibrated
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        mean_centroid = float(np.mean(spectral_centroid))
        S = np.clip((mean_centroid - 800.0) / (4500.0 - 800.0), 0.0, 1.0)

        # 6. Compression / Dynamic Range (C) - Calibrated
        rms_db = 20 * np.log10(rms + 1e-6)
        rms_std = float(np.std(rms_db))
        C = 1.0 - np.clip((rms_std - 1.0) / (9.0 - 1.0), 0.0, 1.0)

        # 7. Key estimation fallback
        musical_key = "--"
        camelot_key = "--"
        if tag_cam_key and tag_mus_key:
            musical_key = tag_mus_key
            camelot_key = tag_cam_key
            print(f"[Worker] Using existing Key from tag: {musical_key} ({camelot_key})")
        else:
            if duration < 3.0 or mean_rms < 0.0001:
                musical_key = "C"
                camelot_key = "8B"
            else:
                print("[Worker] Estimating Key...")
                update_job_status(req.job_id, 70, "กำลังประมวลผลคีย์เพลงและระบบ Camelot...")
                musical_key, camelot_key = estimate_key(y, sr)
                print(f"[Worker] Estimated Key: {musical_key} ({camelot_key})")

        # 8. Tempo Contribution (T)
        perceived_bpm = bpm
        if perceived_bpm > 0:
            while perceived_bpm < 90:
                perceived_bpm *= 2
            while perceived_bpm > 150:
                perceived_bpm /= 2
        T = np.clip((perceived_bpm - 90.0) / (150.0 - 90.0), 0.0, 1.0)

        # Weights: L: 35%, B: 30%, F: 15%, O: 10%, S: 5%, T: 5%
        energy_raw = 0.35 * L + 0.30 * B + 0.15 * F + 0.10 * O + 0.05 * S + 0.05 * T
        
        # Apply Stretching (min_raw=0.25, max_raw=0.80) to produce beautifully distributed values (1-10)
        energy_raw_stretched = np.clip((energy_raw - 0.25) / (0.80 - 0.25), 0.0, 1.0)
        energy = int(np.clip(np.round(1.0 + 9.0 * energy_raw_stretched), 1.0, 10.0))
        
        print(f"[Worker] Computed components - L: {L:.2f}, B: {B:.2f}, F: {F:.2f}, O: {O:.2f}, S: {S:.2f}, T: {T:.2f}")
        print(f"[Worker] Calculated Stretched Energy: {energy_raw_stretched:.3f} (Raw: {energy_raw:.3f}) -> Final Energy: {energy}")

        # Step 6: Update track details in D1
        update_job_status(req.job_id, 95, "บันทึกผลการวิเคราะห์ลงฐานข้อมูล...")
        update_track_metadata(req.track_id, {
            "title": title,
            "artist": artist,
            "album": album,
            "genre": genre,
            "year": year,
            "comments": comments,
            "musical_key": musical_key,
            "camelot_key": camelot_key,
            "bpm": bpm,
            "energy": energy,
            "duration": duration,
            "analysis_status": "completed",
            "cover_art_base64": cover_art_base64
        })

        # Step 7: Completed
        update_job_status(req.job_id, 100, "การวิเคราะห์เสร็จสมบูรณ์!", status="completed")

    except Exception as e:
        print(f"Error in audio analysis: {e}")
        update_job_status(req.job_id, 100, "เกิดข้อผิดพลาดในการวิเคราะห์", status="failed", error_message=str(e))
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

def run_write_tags(req: WriteTagsRequest):
    temp_file_path = None
    try:
        # Step 1: Download original file
        update_job_status(req.job_id, 20, "ดาวน์โหลดต้นฉบับสำหรับการเขียนแท็ก...")
        res = requests.get(req.download_url, headers={"Authorization": f"Bearer {API_SECRET}"})
        res.raise_for_status()

        suffix = os.path.splitext(req.file_name)[1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(res.content)
            temp_file_path = temp_file.name

        # Step 2: Update tags using mutagen
        update_job_status(req.job_id, 40, "กำลังเขียนแท็กข้อมูลลงไฟล์...")
        audio = MutagenFile(temp_file_path)
        
        metadata = req.metadata
        
        if isinstance(audio, MP3):
            try:
                tags = EasyID3(temp_file_path)
            except Exception:
                audio.add_tags()
                tags = EasyID3(temp_file_path)
            
            if 'title' in metadata: tags['title'] = metadata['title']
            if 'artist' in metadata: tags['artist'] = metadata['artist']
            if 'album' in metadata: tags['album'] = metadata['album']
            if 'genre' in metadata: tags['genre'] = metadata['genre']
            if 'year' in metadata: tags['date'] = str(metadata['year'])
            tags.save()
        else:
            # FLAC / WAV / M4A generic keys
            for k, v in metadata.items():
                if v is None: continue
                if k == 'title':
                    audio['TITLE'] = [str(v)]
                    audio['title'] = [str(v)]
                elif k == 'artist':
                    audio['ARTIST'] = [str(v)]
                    audio['artist'] = [str(v)]
                elif k == 'album':
                    audio['ALBUM'] = [str(v)]
                    audio['album'] = [str(v)]
                elif k == 'genre':
                    audio['GENRE'] = [str(v)]
                    audio['genre'] = [str(v)]
                elif k == 'year':
                    audio['DATE'] = [str(v)]
                    audio['date'] = [str(v)]
            audio.save()

        # Step 3: Request presigned R2 upload URL for the NEW edited file
        update_job_status(req.job_id, 60, "สร้างลิงก์สำหรับอัปโหลดไฟล์แก้ไขใหม่...")
        url = f"{WORKER_API_URL}/api/uploads/create-url"
        headers = {"Cookie": f"pandakey_session={requests.utils.cookiejar_from_dict({'pandakey_session': req.job_id})}"} 
        
        # NOTE: Since the Python worker needs to request a URL, it should bypass standard user auth, 
        # or we use the shared secret token to create an upload URL for the track
        # Let's request it with headers:
        headers = {"Authorization": f"Bearer {API_SECRET}"}
        
        # We can implement a secure endpoint or let the python worker call the upload route directly
        # Let's request create-url via direct API endpoint if we adapt our API to support workers.
        # But wait! We can just call a specialized API endpoint, or pass a pre-generated upload URL in the queue message!
        # Since the queue message for write_tags can contain a pre-generated upload URL from the Next.js API,
        # that is much simpler!
        # If we didn't send it, we can call POST /api/uploads/create-url directly.
        # Let's assume the Next.js API has a secret-auth fallback for uploads, 
        # or we can write the edited file back to R2 using the presigned URL that the API provides.
        # Let's fetch create-url using the Bearer token
        upload_req = {
            "fileName": f"edited_{req.file_name}",
            "fileSize": os.path.getsize(temp_file_path),
            "fileType": f"audio/{suffix[1:]}"
        }
        
        # Let's call Next.js endpoint (secured with Bearer token) to create R2 key
        # To do this, we need an API route. Our GET/PATCH /api/tracks accepts worker token!
        # Let's adapt our create-url endpoint in Next.js to also accept worker token if needed,
        # or simply post the file directly to R2 if we have R2 credentials locally!
        # Since the Python worker runs locally and HAS access to .env with the same R2 details,
        # it can just upload directly to R2 using boto3 or HTTP PUT if we generate a presigned URL!
        # Let's check: Next.js API GET/POST uploads/create-url can accept Authorization header just likePATCH tracks.
        # Let's write the API call:
        res_url = requests.post(
            f"{WORKER_API_URL}/api/uploads/create-url", 
            json={
                "fileName": f"edited_{req.file_name}", 
                "fileSize": os.path.getsize(temp_file_path), 
                "fileType": f"audio/{suffix[1:]}",
                "userId": req.user_id,
                "existingTrackId": req.track_id
            },
            headers={"Authorization": f"Bearer {API_SECRET}"}
        )
        res_url.raise_for_status()
        upload_info = res_url.json()
        
        # Step 4: Upload file to R2
        update_job_status(req.job_id, 80, "กำลังอัปโหลดไฟล์ที่แก้ไขไปยัง R2 Storage...")
        with open(temp_file_path, "rb") as f:
            res_put = requests.put(
                upload_info["uploadUrl"], 
                data=f, 
                headers={"Content-Type": f"audio/{suffix[1:]}"}
            )
            res_put.raise_for_status()

        # Step 5: Update track in D1 to point to new key and sync details
        update_job_status(req.job_id, 95, "อัปเดตไฟล์ใหม่ในฐานข้อมูล...")
        update_track_metadata(req.track_id, {
            "title": metadata.get("title"),
            "artist": metadata.get("artist"),
            "album": metadata.get("album"),
            "genre": metadata.get("genre"),
            "year": metadata.get("year"),
            "r2_key": upload_info["r2Key"]
        })

        # Step 6: Complete
        update_job_status(req.job_id, 100, "บันทึกแท็กข้อมูลและเขียนลงไฟล์สำเร็จ!", status="completed")

    except Exception as e:
        print(f"Error writing tags: {e}")
        update_job_status(req.job_id, 100, "การเขียนแท็กผิดพลาด", status="failed", error_message=str(e))
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@app.post("/analyze")
async def analyze_track(req: AnalysisRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_audio_analysis, req)
    return {"message": "Analysis started in background"}

@app.post("/write-tags")
async def write_tags(req: WriteTagsRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_write_tags, req)
    return {"message": "Writing tags started in background"}

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
