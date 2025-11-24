import os
import traceback
from io import BytesIO

import soundfile as sf
import librosa
import numpy as np


def wav2(i, o, format):
    inp = av.open(i, "r")
    if format == "m4a":
        format = "mp4"
    out = av.open(o, "w", format=format)
    if format == "ogg":
        format = "libvorbis"
    if format == "mp4":
        format = "aac"

    ostream = out.add_stream(format)

    for frame in inp.decode(audio=0):
        for p in ostream.encode(frame):
            out.mux(p)

    for p in ostream.encode(None):
        out.mux(p)

    out.close()
    inp.close()


def audio2(i, o, format, sr):
    inp = av.open(i, "r")
    out = av.open(o, "w", format=format)
    if format == "ogg":
        format = "libvorbis"
    if format == "f32le":
        format = "pcm_f32le"

    ostream = out.add_stream(format, channels=1)
    ostream.sample_rate = sr

    for frame in inp.decode(audio=0):
        for p in ostream.encode(frame):
            out.mux(p)

    out.close()
    inp.close()


def load_audio(file, sr):
    """Load audio file and resample to target sample rate."""
    if not os.path.exists(file):
        raise RuntimeError(
            "You input a wrong audio path that does not exists, please fix it!"
        )
    try:
        # Load audio using soundfile
        audio, orig_sr = sf.read(file)
        
        # Convert to mono if stereo
        if len(audio.shape) > 1:
            audio = np.mean(audio, axis=1)
            
        # Resample if needed
        if orig_sr != sr:
            audio = librosa.resample(audio, orig_sr=orig_sr, target_sr=sr)
            
        return audio

    except Exception as e:
        raise RuntimeError(f"Error loading audio file: {str(e)}\n{traceback.format_exc()}")