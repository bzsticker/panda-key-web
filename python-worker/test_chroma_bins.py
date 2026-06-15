import librosa
import numpy as np

# Generate a pure sine wave at 440 Hz (Note A, index 9 in C, C#, D...)
# Duration: 2 seconds, Sample Rate: 22050 Hz
sr = 22050
duration = 2.0
t = np.linspace(0, duration, int(sr * duration), endpoint=False)
y = np.sin(2 * np.pi * 440.0 * t)

# Compute CQT Chromagram
chroma_cqt = librosa.feature.chroma_cqt(y=y, sr=sr, n_chroma=12)
cqt_mean = np.mean(chroma_cqt, axis=1)

# Compute CENS Chromagram
chroma_cens = librosa.feature.chroma_cens(y=y, sr=sr)
cens_mean = np.mean(chroma_cens, axis=1)

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

print("Pure A (440 Hz) CQT mean energy per bin:")
for idx, name in enumerate(NOTE_NAMES):
    print(f"  {name:3s} (bin {idx:2d}): {cqt_mean[idx]:.4f}")

print("\nPure A (440 Hz) CENS mean energy per bin:")
for idx, name in enumerate(NOTE_NAMES):
    print(f"  {name:3s} (bin {idx:2d}): {cens_mean[idx]:.4f}")

# Find index of max energy
cqt_max = np.argmax(cqt_mean)
cens_max = np.argmax(cens_mean)
print(f"\nCQT Max energy bin: {cqt_max} ({NOTE_NAMES[cqt_max]})")
print(f"CENS Max energy bin: {cens_max} ({NOTE_NAMES[cens_max]})")
