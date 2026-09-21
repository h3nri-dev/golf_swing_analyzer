# Synthetic timing fixtures

`timing-30.mp4` and `timing-60.mp4` contain two seconds at 30 and 60 FPS. `timing-slow.mp4` contains the same 120 FPS source stretched to eight seconds and saved at 30 FPS: a 4× slow-motion export. No user footage is included.

Recreate from the repository root with FFmpeg:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=128x224:rate=120:duration=2' \
  -filter_complex '[0:v]split=3[a][b][c];[a]fps=30[a30];[b]fps=60[b60];[c]setpts=4*PTS,fps=30[slow]' \
  -map '[a30]' -an -c:v libx264 -preset fast -crf 32 -pix_fmt yuv420p tests/fixtures/timing-30.mp4 \
  -map '[b60]' -an -c:v libx264 -preset fast -crf 32 -pix_fmt yuv420p tests/fixtures/timing-60.mp4 \
  -map '[slow]' -an -c:v libx264 -preset fast -crf 32 -pix_fmt yuv420p tests/fixtures/timing-slow.mp4
```

Other bundled fixtures are generated videos for orientation, drawing, zoom and duration checks. Real pose inference uses an optional external `POSE_FIXTURE` supplied by the developer.


`window-60s.mp4` is a 60-second, 30 FPS synthetic clip for analysis-window tests. Recreate with:

```sh
ffmpeg -f lavfi -i 'testsrc2=size=96x160:rate=30:duration=60' -an -c:v libx264 -preset fast -crf 38 -pix_fmt yuv420p tests/fixtures/window-60s.mp4
```
