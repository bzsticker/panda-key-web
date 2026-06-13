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


def estimate_key(y, sr):
    # Chroma energy computation
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
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

        # Step 3: Load audio with librosa for BPM/Key
        print(f"[Worker] Loading audio file: {temp_file_path}")
        update_job_status(req.job_id, 50, "กำลังคำนวณค่าจังหวะเพลง (BPM)...")
        # Load at standard sample rate 22050 to avoid librosa CQT Nyquist limit error on low sample rate files
        y, sr = librosa.load(temp_file_path, sr=22050)
        print(f"[Worker] Audio loaded. Sample rate: {sr}, shape: {y.shape}")
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(f"[Worker] Audio duration: {duration} seconds")

        # Calculate advanced energy score (1-10) using multiple signal features
        print("[Worker] Calculating advanced energy score components...")
        update_job_status(req.job_id, 60, "กำลังวิเคราะห์ระดับความแรงและโครงสร้างพลังงานเสียง...")

        rms = librosa.feature.rms(y=y)
        mean_rms = float(np.mean(rms))

        # 1. Loudness (L)
        loudness_db = 20 * np.log10(mean_rms + 1e-6)
        L = np.clip((loudness_db - (-28.0)) / (-8.0 - (-28.0)), 0.0, 1.0)

        # 2. Beat Strength (B)
        onset_env = librosa.onset.onset_strength(y=y, sr=sr)
        tempo_detected, beats = librosa.beat.beat_track(y=y, sr=sr)
        if len(beats) > 0:
            beat_strength = float(np.mean(onset_env[beats]))
        else:
            beat_strength = float(np.mean(onset_env))
        B = np.clip((beat_strength - 1.0) / (3.5 - 1.0), 0.0, 1.0)

        # 3. Onset Density (O)
        onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
        onset_rate = len(onsets) / (duration if duration > 0 else 1.0)
        O = np.clip((onset_rate - 1.5) / (5.5 - 1.5), 0.0, 1.0)

        # 4. Bass Energy (F)
        stft = np.abs(librosa.stft(y))
        frequencies = librosa.fft_frequencies(sr=sr)
        bass_bins = frequencies < 150
        if np.any(bass_bins):
            bass_energy = float(np.mean(stft[bass_bins, :]))
        else:
            bass_energy = 0.0
        F = np.clip((bass_energy - 0.02) / (0.15 - 0.02), 0.0, 1.0)

        # 5. Spectral Brightness (S)
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
        mean_centroid = float(np.mean(spectral_centroid))
        S = np.clip((mean_centroid - 1200.0) / (3200.0 - 1200.0), 0.0, 1.0)

        # 6. Compression / Dynamic Range (C)
        rms_db = 20 * np.log10(rms + 1e-6)
        rms_std = float(np.std(rms_db))
        C = 1.0 - np.clip((rms_std - 2.0) / (7.0 - 2.0), 0.0, 1.0)

        bpm = 0
        musical_key = "--"
        camelot_key = "--"

        if duration < 3.0 or mean_rms < 0.0001:
            print("[Worker] Audio is too short or too silent. Skipping beat/key detection. Fallback to defaults.")
            bpm = 120
            musical_key = "C"
            camelot_key = "8B"
        else:
            # Estimate BPM
            print("[Worker] Estimating BPM...")
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            bpm = int(round(float(tempo[0] if isinstance(tempo, (np.ndarray, list)) else tempo)))
            print(f"[Worker] Estimated BPM: {bpm}")

            # Step 4: Estimate musical key
            print("[Worker] Estimating Key...")
            update_job_status(req.job_id, 70, "กำลังประมวลผลคีย์เพลงและระบบ Camelot...")
            musical_key, camelot_key = estimate_key(y, sr)
            print(f"[Worker] Estimated Key: {musical_key} ({camelot_key})")

        # 7. Tempo Contribution (T)
        perceived_bpm = bpm
        if perceived_bpm < 90:
            perceived_bpm *= 2
        elif perceived_bpm > 150:
            perceived_bpm /= 2
        T = np.clip((perceived_bpm - 90.0) / (150.0 - 90.0), 0.0, 1.0)

        # Synthesize Raw Energy Score
        energy_raw = 0.25 * L + 0.20 * B + 0.15 * O + 0.15 * F + 0.10 * S + 0.10 * C + 0.05 * T
        energy = int(np.clip(np.round(1.0 + 9.0 * energy_raw), 1.0, 10.0))
        print(f"[Worker] Computed components - L: {L:.2f}, B: {B:.2f}, O: {O:.2f}, F: {F:.2f}, S: {S:.2f}, C: {C:.2f}, T: {T:.2f}")
        print(f"[Worker] Calculated Energy Raw: {energy_raw:.3f} -> Final Energy: {energy}")

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
