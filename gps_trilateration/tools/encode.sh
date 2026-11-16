#!/usr/bin/env bash
# Encodes the 1080x1920 @ 30 fps H.264 MP4 (length = sum of the scene lengths in src/scene_timing.json, ~50 s):
#   - base frames      (default frames_base/frame_%05d.jpg, rendered with --captions none)
#   - caption overlay  (default captions_frames/cap_%05d.png, transparent, tools/render_captions.mjs)  [optional]
#   - audio            (default out/voiceover.wav from tools/make_voiceover.py; silent stereo AAC if absent)
#
#   bash tools/encode.sh [output.mp4]
#   BASE=frames CAPS= bash tools/encode.sh      # old behaviour: frames that already have the captions burned in
#
# hqdn3d removes the render's film grain/dither, which x264 cannot compress; bitrate is capped at ~6.5 Mbps
# (typical TikTok / Shorts upload range).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-out/como_o_gps_funciona.mp4}"
BASE="${BASE:-frames_base}"
CAPS="${CAPS-captions_frames}"
AUDIO="${AUDIO-out/voiceover.wav}"
mkdir -p "$(dirname "$OUT")"

TOTAL=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('src/scene_timing.json','utf8')).total_frames)}catch(e){console.log(1800)}")
SECS=$(node -e "console.log(($TOTAL/30).toFixed(3))")
N=$(ls "$BASE"/frame_*.jpg 2>/dev/null | wc -l)
if [ "$N" -ne "$TOTAL" ]; then echo "expected $TOTAL frames in $BASE/, found $N" >&2; exit 1; fi

IN=(-framerate 30 -i "$BASE/frame_%05d.jpg")
# JPEG (full-range BT.601) -> RGB, optional caption overlay in RGB, then -> limited-range BT.709 yuv420p
VF="[0:v]format=rgb24[b]"
LAST="[b]"
if [ -n "$CAPS" ] && [ -f "$CAPS/cap_00000.png" ]; then
  IN+=(-framerate 30 -i "$CAPS/cap_%05d.png")
  VF="$VF;[1:v]format=rgba[o];[b][o]overlay=format=rgb[c]"
  LAST="[c]"
  AIDX=2
else
  AIDX=1
fi
VF="$VF;${LAST}scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,hqdn3d=1.6:1.6:5:5[v]"

if [ -n "$AUDIO" ] && [ -f "$AUDIO" ]; then
  IN+=(-i "$AUDIO")
else
  IN+=(-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000)
fi

ffmpeg -y -hide_banner -loglevel error -stats "${IN[@]}" \
  -filter_complex "$VF" -map "[v]" -map "$AIDX:a" \
  -c:v libx264 -preset medium -crf 23 -maxrate 6500k -bufsize 13M -profile:v high -level 4.2 -r 30 -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 160k -ar 48000 -t "$SECS" -shortest -movflags +faststart "$OUT"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,duration -of default=nw=1 "$OUT"
ls -lh "$OUT"
