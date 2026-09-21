# Swing Studio — Free Golf Swing Analyzer

A build-free static site with two modes: analyze one local golf swing, or compare two clips side by side. Production: https://freegolfswinganalyzer.com.

## Run and deploy

```sh
npm ci
npm start                 # http://localhost:8080 (Python 3 static file server)
npm test                  # geometry, synchronization and missing-data unit tests
npm run test:browser      # Chrome UI tests with bundled synthetic MP4 fixtures
npm run deploy            # existing Cloudflare Pages project; requires wrangler login
```

Node dependencies are development tools only. Production is **just the `deploy/` directory**: HTML, CSS, ES modules and local fonts. No Node server, API, database, account, build step or secret is required. Serve this folder using any static HTTPS host. Opening `index.html` through `file://` is unsupported because of ES-module restrictions.

Browser tests use installed Google Chrome for MP4 support. Set `PLAYWRIGHT_CHANNEL` to another installed supported browser channel if needed. For optional real inference verification, set `POSE_FIXTURE=/absolute/path/to/video.mp4` before `npm run test:browser`; the clip should show a clearly visible person for at least 0.3 seconds. This test downloads the actual model, verifies nonempty measurements, and asserts that no POST/upload requests occur. The checked-in fixtures are generated color-bar videos, not user footage.

## Using the studio

- **Analyze a swing:** choose a local clip, choose the playing hand and an analysis range of up to 20 seconds, then analyze. Scrub to inspect pose landmarks, the lead-hand trail and image-plane joint angles.
- **Compare swings:** load A and B. Linked playback maintains a time offset; independent playback lets you play one clip at a time. Mark the same event (usually impact) in each clip, then choose **Align marked points**. Playback is constrained to the overlapping range and stops when either clip reaches the end.
- Select a clip using the A/B review buttons or its card. The shared timeline, stepping controls, analysis and moment markers operate on this selected clip. Linked seeking moves both clips.
- Set each video's FPS to its source rate. Arrow keys step and Space toggles playback when focus is outside interactive controls. Variable-frame-rate video and browser seeking do not guarantee exact encoded-frame access; stepping is time-based at the selected rate.
- Mark address, top, impact and finish manually. Ordered address/top/impact marks produce the backswing-to-downswing tempo ratio. Export saves the selected clip's marks and sampled measurements as JSON. Refresh clears the session.
- Video decoding depends on the browser and codec. H.264 MP4 and WebM are recommended. A MOV extension alone does not guarantee support.

## Analysis and privacy

The app lazy-loads pinned MediaPipe Tasks Vision 0.10.21 and the Pose Landmarker Lite model. Code/WASM comes from jsDelivr and model weights come from Google's public storage; **video pixels stay in browser memory**. A network connection is required for uncached model assets. Regular video review works without the model. Fonts are served locally; the application has no analytics code, cookie storage, or video upload endpoint. The existing Cloudflare Pages host injects its own web analytics beacon for page visits and performance data, disclosed in the privacy dialog. It receives no video content or swing measurements.

Each run uses a fresh CPU model, scans at up to 30 samples/second with a maximum of 240 samples, and downscales inference images to a 640-pixel longest edge. Analysis yields between samples, supports cancellation (including stalled model initialization), times out stalled downloads/seeks, and preserves prior results when cancelled. Object URLs are revoked when clips are replaced or removed.

Measurements require landmark visibility of at least 0.65. Pixel-space geometry corrects for aspect ratio. A three-sample median suppresses isolated jitter without inventing landmarks in missing frames. The overlay chooses only nearby samples and does not bridge missing hand-path observations. Pose coverage is the fraction of sampled frames with visible shoulders and hips, not a quality score.

Elbow and knee angles and torso lean are **2D estimates**, influenced by viewpoint, clothing, occlusion and motion blur. They are not 3D rotation measurements, ball-flight predictions or professional coaching. Swing phases are user-marked; tempo is not an inferred skill rating. The legacy minified heuristic club/ball detection and numerical swing ratings have been removed in favor of these inspectable measurements.

References: [MediaPipe web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [PoseLandmarker API](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.poselandmarker).

## Source layout

- `deploy/index.html` — semantic layout, single/compare modes, privacy details.
- `deploy/styles.css` — responsive studio design.
- `deploy/app.js` — file lifecycle, playback, synchronized seeking, overlays, lazy inference and exports.
- `deploy/analysis.js` — pure geometry, confidence filtering, smoothing, timing helpers.
- `deploy/fonts/` — locally hosted DM Sans and Manrope, with their OFL licenses.
- `tests/` — unit and browser tests plus generated fixtures.

Cloudflare Pages deploys the static directory to `freegolfswinganalyzer`, branch `main`. The existing custom domain is retained. No Cloudflare Functions or Workers run for analysis.
