#!/usr/bin/env bash
# Encodes frames/frame_%05d.jpg (30 fps, 1080x1920) into a 60 s H.264 MP4 with a SILENT stereo AAC track
# (no TTS). Captions are already burned into the frames.
#   bash tools/encode.sh [output.mp4]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-out/como_o_gps_funciona.mp4}"
mkdir -p "$(dirname "$OUT")"
N=$(ls frames/frame_*.jpg 2>/dev/null | wc -l)
if [ "$N" -ne 1800 ]; then echo "expected 1800 frames in frames/, found $N" >&2; exit 1; fi
ffmpeg -y -hide_banner -loglevel error -stats \
  -framerate 30 -i frames/frame_%05d.jpg \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -vf "scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p" \
  -c:v libx264 -preset slow -crf 17 -profile:v high -level 4.2 -r 30 -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 128k -t 60 -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -of default=nw=1 "$OUT"
ls -lh "$OUT"
