import sqlite3
import os
import glob
import sys

sys.stdout.reconfigure(encoding='utf-8')

d1_path = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\25ff06fa9302bd9f38c71601a0a9fc9f40f6d364faa77c0a644a1a599f0ce659.sqlite"

d1_conn = sqlite3.connect(d1_path)
d1_cursor = d1_conn.cursor()
d1_cursor.execute("SELECT id, file_name, bpm, musical_key, camelot_key, energy FROM tracks")
tracks = d1_cursor.fetchall()
d1_conn.close()

print(f"Total tracks in DB: {len(tracks)}")
for idx, t in enumerate(tracks):
    track_id, file_name, db_bpm, db_mus, db_cam, db_energy = t
    print(f"{idx+1:02d}. {repr(file_name)} | BPM: {db_bpm} | Key: {db_mus} ({db_cam}) | Energy: {db_energy}")
