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
- **Compare swings:** load A and B. **Sync on** plays and steps both clips together. Mark the same event (usually impact) in each clip, then choose **Align marked points**. Synchronized playback is constrained to the overlapping range and stops when either clip reaches the end.
- **Sync off** gives each video its own play/pause, timeline, frame steps and speed. Play either clip alone or both at once at different speeds. Pausing, scrubbing, stepping, marking, replacing or reaching the end of one clip leaves the other playing. Turning sync off preserves current playback and zoom. Turning it on pauses and aligns both at the selected clip's position (within the shared range), preserves any marked offset, and uses the selected clip's speed; press Play to resume together.
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

## Drawing and comparison

The **Drawing tools** panel sits directly above the videos and works without pose analysis. Choose **Pen**, **Line**, **Arrow**, **Circle** (an adjustable ellipse), or **Angle**, then draw directly on either loaded video. Drawing pauses playback. For an angle, tap/click the first endpoint, the joint/vertex, and the other endpoint; the label is an image-plane angle in degrees.

- **Select** moves an existing drawing; white handles adjust endpoints and circle bounds. Pen strokes move as one object. The color and stroke selectors also edit a selected shape.
- **Entire clip** keeps reference drawings visible throughout playback. **This frame** attaches a drawing to the current timestamp with a half-frame tolerance based on the selected source FPS. **Marked frames** buttons revisit these moments.
- **Copy visible to A/B** copies the current visible drawings to the other clip. If a drawing is selected, only that drawing is copied. Positions are relative to the image, so different camera views may need manual adjustment with Select. A frame-scoped copy belongs to the destination's current time.
- Each video has its own undo/redo history (50 edits). Clear, delete, copy and style changes can all be undone. Use Ctrl/⌘ Z, Ctrl/⌘ Shift Z, Delete, or Escape (cancel the current drawing / return to View).
- **Hide drawings** temporarily hides only manual annotations. Pose overlays remain independently controllable. **View** allows regular viewing; playing a video exits the drawing tool.
- **Save image / Save comparison** downloads the currently displayed frame(s), visible drawings and pose overlays as a PNG. This is a still image, not an annotated video recording. JSON analysis exports now include editable drawing geometry and measured angles, but importing a saved session is not implemented. Refreshing or replacing a clip clears its drawings.

Annotations are vector data in normalized, unmirrored video coordinates. Pointer events handle mouse, touch and pen input. The drawing layer fits the actual video image, supports high-DPI screens, and remains aligned through resizing, portrait/landscape media and mirroring. Text on angle labels remains readable when mirrored. Export composes local frames and overlays in the browser; nothing is uploaded.

The workflow was informed by primary documentation for [Kinovea annotation tools](https://www.kinovea.org/help/en/annotation/tools.html), [editable drawings and key images](https://kinovea.readthedocs.io/en/latest/annotation/annotations.html), [drawing persistence](https://kinovea.readthedocs.io/en/latest/userinterface/preferences/drawings.html), [image-plane angle limitations](https://www.kinovea.org/help/en/measurement/angle.html), and [Onform's drawing and comparison tools](https://onform.com/blog/analysis-tools-webinar/). It does not implement automatic tracking of hand-drawn objects.

Implementation: `deploy/drawing.js` contains pure annotation geometry, history and rendering; `deploy/annotations.js` owns the toolbar, pointer interactions, per-clip state and PNG export. Unit tests cover coordinate transforms, angle geometry, bounds, visibility, hit-testing and history. Browser tests exercise drawing, editing, copying, export, touch, mirroring, resizing and clip replacement.

## Zoom and pan

The workspace fills the available screen width with modest outer margins. On desktop, video frames grow with the window's height and width in both single and comparison mode, including large and ultrawide monitors. The insights sidebar keeps its compact width so the extra space goes to the videos. Phone and tablet layouts retain smaller frames and readable controls. Resizing preserves playback, zoom and drawing alignment.

Each video has its own **− / +** buttons and **Zoom** slider, from **1× (Fit) to 4×**. Zooming or panning does not pause playback. The view is retained when playing, pausing, changing speed, scrubbing, stepping, running analysis, switching modes, or resizing the window. The two comparison videos keep independent views even when their playback is linked.

When zoomed and using **View**, drag the video to pan. **Pan** returns from a drawing tool to view movement without pausing the video; press it again to disable dragging. Pinch with two fingers while Pan is active, or use Ctrl/⌘ + scroll over the video to zoom around the pointer. Ordinary scrolling still scrolls the page. **Fit** restores 1× and centers that clip. Loading a replacement clip resets only its own view.

The video, pose overlay, and manual drawings share one transformed image plane, so drawing and editing work at any magnification. Exported PNGs show the current zoomed crop (including pan and mirroring); JSON exports include the normalized view center and zoom. This is display magnification, not an increase in the source video's resolution. Session views are not retained after a page reload.

`deploy/viewport.js` contains bounded view geometry, controls, and mouse/touch interactions. Tests verify playback persistence, independent comparison views, pointer-anchored zoom, pan bounds, frame stepping, resizing, mirror/drawing alignment, touch gestures, and image export.
