from fastapi import FastAPI, UploadFile, File, HTTPException
import shutil, tempfile
from pathlib import Path
import subprocess
import torch, torch.nn as nn, torch.nn.functional as F
import soundfile as sf, numpy as np
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
import imageio_ffmpeg

app = FastAPI()

# Constants
SAMPLE_RATE   = 16000
FFT_SIZE      = 512
HOP_LENGTH    = 256
TARGET_FRAMES = 256
EPSILON       = 1e-8
device        = torch.device("cpu")

# STFT helpers 
def compute_stft(waveform):
    window = np.hanning(FFT_SIZE)
    num_frames = 1 + (len(waveform) - FFT_SIZE) // HOP_LENGTH
    frames = np.array([waveform[i*HOP_LENGTH : i*HOP_LENGTH+FFT_SIZE] * window
                       for i in range(num_frames)])
    stft = np.fft.rfft(frames, n=FFT_SIZE, axis=1).T
    return np.abs(stft), np.angle(stft)

def compute_istft(magnitude, phase):
    window = np.hanning(FFT_SIZE)
    complex_spec = magnitude * np.exp(1j * phase)
    frames = np.fft.irfft(complex_spec, n=FFT_SIZE, axis=0)
    num_frames = frames.shape[1]
    out_len = FFT_SIZE + (num_frames - 1) * HOP_LENGTH
    waveform, window_sum = np.zeros(out_len), np.zeros(out_len)
    for i in range(num_frames):
        s = i * HOP_LENGTH
        waveform[s:s+FFT_SIZE]   += frames[:, i] * window
        window_sum[s:s+FFT_SIZE] += window ** 2
    nz = window_sum > EPSILON
    waveform[nz] /= window_sum[nz]
    return waveform

def pad_or_crop(spec, target):
    _, T = spec.shape
    if T < target:
        return np.concatenate([spec, np.zeros((spec.shape[0], target - T))], axis=1)
    return spec[:, :target]

# Model 
class ConvBlock(nn.Module):
    def __init__(self, in_ch, out_ch):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_ch,  out_ch, 3, padding=1), nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
            nn.Conv2d(out_ch, out_ch, 3, padding=1), nn.BatchNorm2d(out_ch), nn.ReLU(inplace=True),
        )
    def forward(self, x): return self.conv(x)

class UNetSpeechEnhancement(nn.Module):
    def __init__(self):
        super().__init__()
        self.enc1 = ConvBlock(1, 16);   self.enc2 = ConvBlock(16, 32)
        self.enc3 = ConvBlock(32, 64);  self.enc4 = ConvBlock(64, 128)
        self.pool = nn.MaxPool2d(2)
        self.bottleneck = ConvBlock(128, 256)
        self.dec4 = ConvBlock(256+128, 128); self.dec3 = ConvBlock(128+64, 64)
        self.dec2 = ConvBlock(64+32,   32);  self.dec1 = ConvBlock(32+16,  16)
        self.output_conv = nn.Conv2d(16, 1, 1)

    def forward(self, x):
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))
        e4 = self.enc4(self.pool(e3))
        b  = self.bottleneck(self.pool(e4))
        d4 = self.dec4(torch.cat([F.interpolate(b,  size=e4.shape[2:], mode='bilinear', align_corners=True), e4], 1))
        d3 = self.dec3(torch.cat([F.interpolate(d4, size=e3.shape[2:], mode='bilinear', align_corners=True), e3], 1))
        d2 = self.dec2(torch.cat([F.interpolate(d3, size=e2.shape[2:], mode='bilinear', align_corners=True), e2], 1))
        d1 = self.dec1(torch.cat([F.interpolate(d2, size=e1.shape[2:], mode='bilinear', align_corners=True), e1], 1))
        noise_pred = self.output_conv(d1)
        return x - noise_pred, noise_pred



# Load model
model = UNetSpeechEnhancement()
checkpoint = torch.load("best_checkpoint.pth", map_location=device)
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def cleanup_temp_dir(temp_dir: str):
    shutil.rmtree(temp_dir, ignore_errors=True)


def wav_to_mp3(input_wav: str, output_mp3: str):
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        input_wav,
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        output_mp3,
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def decode_audio_to_wav(input_audio: str, output_wav: str):
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        input_audio,
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        output_wav,
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)

# Chunked inference 
def denoise_long_audio(audio, model, device):
    OVERLAP      = 32
    CHUNK_FRAMES = TARGET_FRAMES
    STEP         = CHUNK_FRAMES - OVERLAP

    mag, phase      = compute_stft(audio)
    original_frames = mag.shape[1]
    log_mag         = np.log(mag + EPSILON)

    output_mag = np.zeros_like(log_mag)
    weight     = np.zeros(original_frames)
    blend      = np.hanning(CHUNK_FRAMES)

    start = 0
    while start < original_frames:
        end   = min(start + CHUNK_FRAMES, original_frames)
        chunk = log_mag[:, start:end]

        if chunk.shape[1] < CHUNK_FRAMES:
            chunk = np.pad(chunk, ((0,0),(0, CHUNK_FRAMES - chunk.shape[1])))

        x = torch.tensor(chunk[np.newaxis, np.newaxis, :, :]).float().to(device)

        with torch.no_grad():
            enhanced, _ = model(x)

        enhanced_np = enhanced.squeeze().cpu().numpy()

        valid_len = end - start
        enhanced_np = enhanced_np[:, :valid_len]
        b = blend[:valid_len]

        output_mag[:, start:end] += enhanced_np * b
        weight[start:end]        += b

        start += STEP

    weight        = np.maximum(weight, 1e-8)
    output_mag   /= weight
    mag_out       = np.exp(output_mag) - EPSILON
    reconstructed = compute_istft(mag_out, phase)
    return reconstructed

# Endpoint 
@app.post("/denoise/")
async def denoise_audio(file: UploadFile = File(...)):
    temp_dir = tempfile.mkdtemp(prefix="denoise_")
    original_suffix = Path(file.filename or "upload").suffix or ".bin"

    uploaded_path = Path(temp_dir) / f"uploaded{original_suffix}"
    converted_wav_path = Path(temp_dir) / "input_converted.wav"
    output_wav_path = Path(temp_dir) / "output.wav"
    output_mp3_path = Path(temp_dir) / "denoised.mp3"

    try:
        with open(uploaded_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Decode any supported uploaded format into model-ready WAV (16kHz mono).
        decode_audio_to_wav(str(uploaded_path), str(converted_wav_path))
        audio, _ = sf.read(str(converted_wav_path), dtype="float32")

        reconstructed = denoise_long_audio(audio, model, device)

        print(f"Input length : {len(audio)} samples")
        print(f"Output length: {len(reconstructed)} samples")

        sf.write(str(output_wav_path), reconstructed, SAMPLE_RATE)
        wav_to_mp3(str(output_wav_path), str(output_mp3_path))

    except Exception as exc:
        cleanup_temp_dir(temp_dir)
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not process uploaded audio. Make sure the file is a valid audio format "
                "and can be decoded correctly."
            ),
        ) from exc

    return FileResponse(
        str(output_mp3_path),
        media_type="audio/mpeg",
        filename="denoised.mp3",
        background=BackgroundTask(cleanup_temp_dir, temp_dir),
    )