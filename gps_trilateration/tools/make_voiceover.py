#!/usr/bin/env python3
"""Neural pt-BR voice-over (Edge TTS, pt-BR-AntonioNeural) with per-phrase "direction".

Each scene's line is split into phrases; every phrase gets its own rate / pitch / volume so the delivery is dynamic
(curious, dramatic pause, intimate reveal, energetic climax, upbeat CTA) instead of one flat read. Each scene is then
fitted into its 5 s slot (speed-up if needed), stitched into a 60 s track, mastered (EQ + compression + loudness
normalisation) and the real per-word timings are written out so the captions can be re-synchronised to the voice.

Needs network access to speech.platform.bing.com. Outputs:
  out/voiceover.wav       60 s mastered stereo track (used by tools/encode.sh)
  out/voiceover.mp3       same, compressed (small, committed)
  out/voice_words.json    per scene: phrases + every spoken word with absolute start/end seconds

  python3 tools/make_voiceover.py [--voice pt-BR-AntonioNeural]
"""
import asyncio, json, os, re, ssl, subprocess, sys, tempfile, wave
import numpy as np
import edge_tts
from edge_tts import communicate as _C

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'out'); os.makedirs(OUT, exist_ok=True)
VOICE = sys.argv[sys.argv.index('--voice') + 1] if '--voice' in sys.argv else 'pt-BR-AntonioNeural'
SR = 24000                 # synthesis sample rate
SCENE_S = 5.0
VO_START = 0.15            # the voice starts this long after each hard cut
TARGET = 4.55              # max seconds of speech per scene (0.15 + 4.55 < 5 s: always done before the next cut)
MAX_RATE = 0.42            # never speed the TTS up beyond +42 % (quality), the rest is trimmed from pauses

# The edge-tts client does not use HTTPS_PROXY by itself and must trust the egress proxy's CA (verification stays ON).
if os.path.exists('/root/.ccr/ca-bundle.crt'):
    _C._SSL_CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
PROXY = os.environ.get('HTTPS_PROXY')

# (text, rate %, pitch Hz, volume %, pause after in s).  Concatenated text == the VO line of the script.
PLAN = [
    # 1 - hook: confident, then a beat of silence, then the punch
    [("Tudo o que te ensinaram sobre como o GPS do seu celular funciona...", +12, +2, +0, 0.30),
     ("está totalmente errado.", +2, +7, +14, 0.0)],
    # 2 - the myth: casual, slightly sceptical, trailing off
    [("A maioria das pessoas acha que o seu celular manda o sinal...", +10, +2, +0, 0.0)],
    # 3 - the error: quick set-up, then the dramatic reversal
    [("para o espaço e o satélite te acha...", +12, +3, +0, 0.28),
     ("mas é o exato oposto!", +0, +9, +16, 0.0)],
    # 4 - the reveal: firm, then low and intimate
    [("O seu celular não manda nada para cima.", +8, +2, +4, 0.30),
     ("Ele apenas escuta.", -10, -5, +0, 0.0)],
    # 5 - explaining: bright and clear
    [("Satélites no espaço enviam a hora exata do sinal...", +9, +3, +2, 0.0)],
    # 6 - building the sphere
    [("e o celular calcula o tempo de chegada,", +10, +1, +0, 0.16),
     ("desenhando uma esfera gigante.", +2, +6, +10, 0.0)],
    # 7 - counting up satellites
    [("Com um satélite, você está em qualquer lugar.", +10, +2, +0, 0.20),
     ("Com três, a área diminui...", +4, +5, +6, 0.0)],
    # 8 - the secret
    [("mas é o quarto satélite", -2, +4, +6, 0.12),
     ("que muda tudo.", -6, +9, +16, 0.0)],
    # 9 - crescendo into the climax
    [("Ele cruza todas as esferas", +10, +3, +4, 0.14),
     ("e crava milimetricamente a sua altitude.", +4, +10, +16, 0.0)],
    # 10 - musing, wonder
    [("Bizarro pensar que o mapa do seu bolso...", +2, +1, +0, 0.0)],
    # 11 - the payoff: excited
    [("funciona conversando direto com o espaço sideral!", +6, +9, +16, 0.0)],
    # 12 - CTA: upbeat and friendly
    [("Curtiu?", +6, +11, +10, 0.22),
     ("Segue para mais curiosidades de tecnologia!", +10, +7, +10, 0.0)],
]


def pct(x):  return f"{x:+.0f}%"
def hz(x):   return f"{x:+.0f}Hz"


def decode(mp3_bytes):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'pipe:0', '-f', 'f32le', '-ar', str(SR), '-ac', '1', 'pipe:1'],
                       input=mp3_bytes, capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


async def synth(text, rate, pitch, vol, tries=4):
    for k in range(tries):
        try:
            c = edge_tts.Communicate(text, VOICE, rate=rate, pitch=pitch, volume=vol, boundary='WordBoundary', proxy=PROXY)
            mp3, words = bytearray(), []
            async for ch in c.stream():
                if ch['type'] == 'audio': mp3 += ch['data']
                elif ch['type'] == 'WordBoundary':
                    words.append((ch['text'], ch['offset'] / 1e7, ch['duration'] / 1e7))
            if not mp3 or not words: raise RuntimeError('empty synthesis')
            pcm = decode(bytes(mp3))
            # trim the lead-in silence (first word offset) and keep a short natural tail
            t0 = max(0.0, words[0][1] - 0.02)
            t1 = min(len(pcm) / SR, words[-1][1] + words[-1][2] + 0.10)
            pcm = pcm[int(t0 * SR):int(t1 * SR)]
            words = [(w, s - t0, s - t0 + d) for (w, s, d) in words]
            return pcm, words
        except Exception as e:
            if k == tries - 1: raise
            await asyncio.sleep(1.5 * (k + 1))


async def build_scene(idx, speed):
    """Synthesise all phrases of a scene at a global speed multiplier; returns (pcm, words, phrase_spans)."""
    chunks, words_out, spans, t = [], [], [], 0.0
    for text, rate, pitch, vol, pause in PLAN[idx]:
        r = min(MAX_RATE, (1 + rate / 100) * speed - 1) * 100
        pcm, words = await synth(text, pct(r), hz(pitch), pct(vol))
        chunks.append(pcm)
        for w, s, e in words: words_out.append((w, t + s, t + e))
        spans.append({'text': text, 'rate': round(r), 'pitch': pitch, 'volume': vol, 'start': round(t, 3), 'end': round(t + len(pcm) / SR, 3)})
        t += len(pcm) / SR
        gap = pause / max(speed, 1.0)
        chunks.append(np.zeros(int(gap * SR), dtype=np.float32)); t += gap
    pcm = np.concatenate(chunks)
    # 6 ms fades so scene boundaries never click
    n = int(0.006 * SR); pcm[:n] *= np.linspace(0, 1, n); pcm[-n:] *= np.linspace(1, 0, n)
    return pcm, words_out, spans


async def main():
    track = np.zeros(int(60 * SR), dtype=np.float32)
    report = []
    for i in range(12):
        speed = 1.0
        for attempt in range(3):
            pcm, words, spans = await build_scene(i, speed)
            dur = len(pcm) / SR
            if dur <= TARGET or speed >= 1.6: break
            speed *= max(1.04, dur / TARGET)           # speed up (rates are capped, so also check again)
        start = i * SCENE_S + VO_START
        a = int(start * SR); track[a:a + len(pcm)] += pcm[:len(track) - a]
        abs_words = [{'text': w, 'start': round(start + s, 3), 'end': round(start + e, 3)} for (w, s, e) in words]
        report.append({'scene': i + 1, 'voice_start': round(start, 3), 'voice_end': round(start + dur, 3), 'duration': round(dur, 3), 'speed': round(speed, 3), 'phrases': spans, 'words': abs_words})
        flag = '' if dur <= TARGET + 0.05 else '   <-- LONGER than target'
        print(f"scene {i+1:2d}: {dur:4.2f}s  speed x{speed:.2f}  rates {[p['rate'] for p in spans]}{flag}", flush=True)

    # master: HPF -> presence EQ -> compressor -> loudness normalisation (-14 LUFS like TikTok/Shorts) -> stereo 48 kHz
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, 'raw.wav')
        with wave.open(raw, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(track, -1, 1) * 32767).astype('<i2').tobytes())
        chain = ('highpass=f=75,equalizer=f=220:t=q:w=1.0:g=1.5,equalizer=f=3200:t=q:w=1.1:g=2.5,'
                 'acompressor=threshold=-21dB:ratio=3:attack=6:release=90:makeup=4,'
                 'loudnorm=I=-14:TP=-1.5:LRA=8,volume=-2.5dB,aresample=48000,pan=stereo|c0=c0|c1=c0,atrim=0:60,apad=whole_dur=60')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', chain, '-ar', '48000', os.path.join(OUT, 'voiceover.wav')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(OUT, 'voiceover.wav'), '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(OUT, 'voiceover.mp3')], check=True)
    with open(os.path.join(OUT, 'voice_words.json'), 'w') as f:
        json.dump({'voice': VOICE, 'scenes': report}, f, ensure_ascii=False, indent=1)
    print('wrote out/voiceover.wav, out/voiceover.mp3, out/voice_words.json')


asyncio.run(main())
