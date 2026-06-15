import os
import glob
from mutagen import File as MutagenFile

blobs_dir = r"e:\PandaKey\panda-key-web\.wrangler\state\v3\r2\pandakey-r2\blobs"
files = glob.glob(os.path.join(blobs_dir, "*"))

print(f"Scanning {len(files)} blob files:")
for f in files:
    try:
        audio = MutagenFile(f)
        if audio is not None:
            # Print title
            title = ""
            for tag in ['TIT2', '\xa9nam', 'TITLE', 'title']:
                if tag in audio:
                    title = str(audio[tag])
                    break
            if title:
                print(f"File: {os.path.basename(f)} | Title: {repr(title)}")
    except Exception:
        pass
