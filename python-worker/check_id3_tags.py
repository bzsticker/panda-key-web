import sqlite3
import os
import glob
import sys
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
d1_cursor.execute("SELECT id, file_name, r2_key, bpm, musical_key, camelot_key, energy FROM tracks")
tracks = d1_cursor.fetchall()
d1_conn.close()

print("Scanning track files for ID3 tags:")
for idx, t in enumerate(tracks):
    track_id, file_name, r2_key, db_bpm, db_mus, db_cam, db_energy = t
    blob_id = r2_map.get(r2_key)
    blob_file = os.path.join(blobs_dir, blob_id) if blob_id else None
    
    if not blob_file or not os.path.exists(blob_file):
        continue
        
    try:
        audio = MutagenFile(blob_file)
        if audio is None:
            continue
            
        # Try to find BPM and Key tags
        bpm_tag = ""
        key_tag = ""
        
        # Check standard ID3 tags for MP3
        if hasattr(audio, 'tags') and audio.tags:
            if 'TBPM' in audio.tags:
                bpm_tag = str(audio.tags['TBPM'])
            if 'TKEY' in audio.tags:
                key_tag = str(audio.tags['TKEY'])
                
        # For M4A/FLAC/others
        if not bpm_tag and 'bpm' in audio:
            bpm_tag = str(audio['bpm'])
        if not key_tag and 'key' in audio:
            key_tag = str(audio['key'])
            
        if bpm_tag or key_tag:
            print(f"\nTrack: {repr(file_name)}")
            print(f"  ID3 Tag -> BPM: {bpm_tag} | Key: {key_tag}")
            print(f"  DB Data -> BPM: {db_bpm} | Key: {db_mus} ({db_cam})")
    except Exception as e:
        print(f"Error reading tags for {file_name}: {e}")
