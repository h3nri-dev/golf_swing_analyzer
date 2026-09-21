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

## UX design

See [UX_REVIEW.md](UX_REVIEW.md) for the task review, research sources, observed problems, changes and remaining user-validation work.

## Using the studio

- **Single video:** choose a local clip, select a section in **Range**, then choose **Analyze**. Only that section is scanned. Open **Results** to select your playing hand and inspect pose landmarks, the lead-hand trail and image-plane joint angles.
- **Compare videos:** load A and B. **Sync on** plays and steps both clips together. Choose **Set alignment**, move each clip to the same event (usually impact), then choose **Align frames**. If Sync off is already selected, position the clips and choose Align frames directly. Synchronized playback is constrained to the overlapping range and stops when either clip reaches the end.
- **Sync off** gives each video its own play/pause, timeline, frame steps and speed. Play either clip alone or both at once at different speeds. Pausing, scrubbing, stepping, marking, replacing or reaching the end of one clip leaves the other playing. Turning sync off preserves current playback and zoom. Turning it on pauses and aligns both at the selected clip's position (within the shared range), preserves the alignment offset, and uses the selected clip's speed; press Play to resume together.
- Select a clip using the A/B review buttons or its card. The shared timeline, stepping controls, analysis and moment markers operate on this selected clip. Linked seeking moves both clips.
- Open **Video** to set the selected clip's Frame rate, mirror, Pan or Fit. Speed lives beside the appropriate playback controls. Match Frame rate to the source rate. Arrow keys step and Space toggles playback when focus is outside interactive controls. Variable-frame-rate video and browser seeking do not guarantee exact encoded-frame access; stepping is time-based at the selected rate.
- Open **Moments** to mark address, top, impact and finish manually. Ordered address/top/impact marks produce the backswing-to-downswing tempo ratio. Export saves the selected clip's marks and sampled measurements as JSON. Refresh clears the session.
- Video decoding depends on the browser and codec. H.264 MP4 and WebM are recommended. A MOV extension alone does not guarantee support.

## Selecting an analysis range

Open the **Range** tab in the workspace header. The panel stays beside or over the video, within the same screen. Drag the two handles to highlight any section of up to **20 seconds**, or enter exact start/end times in seconds. Dragging a handle previews that boundary; keyboard arrow keys adjust a focused handle. You can also pause or step to a moment and choose **Set here** for Start or End. **Go** beside Start or End revisits either boundary without changing your selection. The playhead remains visible on the range bar.

Each comparison clip keeps its own selection, even with synchronized playback. Range previews can inspect the selected clip outside the pair's shared playback interval; normal synchronized playback still uses the shared interval. **Use full clip** selects a short clip in full; on longer videos, **First 20 seconds** restores the initial selection. Empty, reversed, out-of-bounds or overlong ranges show an inline explanation and disable analysis until corrected.

Changing the range preserves earlier results and marks, with a reminder to analyze again. JSON exports include `selectedRange` and `analyzedRange` separately; `range` describes the exported measurements' analyzed interval when results exist. Cancelling an analysis preserves previous results and their original interval. Analysis restores the playhead and retains zoom and drawings.

## Analysis and privacy

The app lazy-loads pinned MediaPipe Tasks Vision 0.10.21 and the Pose Landmarker Lite model. Code/WASM comes from jsDelivr and model weights come from Google's public storage; **video pixels stay in browser memory**. A network connection is required for uncached model assets. Regular video review works without the model. Fonts are served locally; the application has no analytics code, cookie storage, or video upload endpoint. The existing Cloudflare Pages host injects its own web analytics beacon for page visits and performance data, disclosed in the privacy dialog. It receives no video content or swing measurements.

Each run uses a fresh CPU model, scans at up to 30 samples/second with a maximum of 240 samples, and downscales inference images to a 640-pixel longest edge. Analysis yields between samples, supports cancellation (including stalled model initialization), times out stalled downloads/seeks, and preserves prior results when cancelled. Object URLs are revoked when clips are replaced or removed.

Measurements require landmark visibility of at least 0.65. Pixel-space geometry corrects for aspect ratio. A three-sample median suppresses isolated jitter without inventing landmarks in missing frames. The overlay chooses only nearby samples and does not bridge missing hand-path observations. Pose coverage is the fraction of sampled frames with visible shoulders and hips, not a quality score.

Elbow and knee angles and torso lean are **2D estimates**, influenced by viewpoint, clothing, occlusion and motion blur. They are not 3D rotation measurements, ball-flight predictions or professional coaching. Swing phases are user-marked; tempo is not an inferred skill rating. The legacy minified heuristic club/ball detection and numerical swing ratings have been removed in favor of these inspectable measurements.

References: [MediaPipe web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [PoseLandmarker API](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.poselandmarker).

## Source layout

- `deploy/index.html` — semantic layout, single/compare modes, privacy details.
- `deploy/styles.css` — base studio design.
- `deploy/screen.js`, `deploy/screen.css` — viewport workspace, accessible control panels and scroll snapping.
- `deploy/ux.js`, `deploy/ux.css` — task help, session-work confirmation and interaction refinements.
- `deploy/app.js` — file lifecycle, playback, synchronized seeking, overlays, lazy inference and exports.
- `deploy/analysis.js` — pure geometry, confidence filtering, smoothing, timing helpers.
- `deploy/range.js` — range selection, boundary previews and validation.
- `deploy/fonts/` — locally hosted DM Sans and Manrope, with their OFL licenses.
- `tests/` — unit and browser tests plus generated fixtures.

Cloudflare Pages deploys the static directory to `freegolfswinganalyzer`, branch `main`. The existing custom domain is retained. No Cloudflare Functions or Workers run for analysis.

## Drawing and comparison

The vertical **Draw** rail stays beside the videos, on desktop and phone. Short screens use labeled-on-hover icons, and landscape phones use two narrow tool columns. Choose **Pen**, **Line**, **Arrow**, **Circle** (an adjustable ellipse), or **Angle**, then draw directly on either loaded video. Undo and Redo are in the same rail. Drawing pauses the clip being edited; with Sync off, the other clip can keep playing. For an angle, tap/click the first endpoint, the joint/vertex, and the other endpoint; the label is an image-plane angle in degrees.

Open **Draw** for color, stroke, visibility duration, copy, hide, delete and image export. The header's A/B selector chooses the editing target. Single and synchronized review use one shared playback control. Sync off puts independent play, speed and timeline controls beneath each video. **Back to video** or Escape gives videos the sidebar's space without stopping playback, resetting zoom or moving drawings. On phones and tablets, controls open over the footage; close them or choose a drawing tool to return to the unobstructed video. All five panel tabs remain accessible in the header.

- **Select** moves an existing drawing; white handles adjust endpoints and circle bounds. Pen strokes move as one object. The color and stroke selectors also edit a selected shape.
- **Entire clip** keeps reference drawings visible throughout playback. **This frame** attaches a drawing to the current timestamp with a half-frame tolerance based on the selected source FPS. The **Choose a frame** menu revisits these moments.
- **Copy visible to A/B** copies the current visible drawings to the other clip. If a drawing is selected, only that drawing is copied. Positions are relative to the image, so different camera views may need manual adjustment with Select. A frame-scoped copy belongs to the destination's current time.
- Each video has its own undo/redo history (50 edits). Clear, delete, copy and style changes can all be undone. Use Ctrl/⌘ Z, Ctrl/⌘ Shift Z, Delete, or Escape (cancel the current drawing / return to View).
- **Hide drawings** temporarily hides only manual annotations. Pose overlays remain independently controllable. **View** allows regular viewing; playing a video exits the drawing tool.
- **Save image / Save comparison** downloads the currently displayed frame(s), visible drawings and pose overlays as a PNG. This is a still image, not an annotated video recording. JSON analysis exports now include editable drawing geometry and measured angles, but importing a saved session is not implemented. Refreshing or replacing a clip clears its drawings.

Annotations are vector data in normalized, unmirrored video coordinates. Pointer events handle mouse, touch and pen input. The drawing layer fits the actual video image, supports high-DPI screens, and remains aligned through resizing, portrait/landscape media and mirroring. Text on angle labels remains readable when mirrored. Export composes local frames and overlays in the browser; nothing is uploaded.

The workflow was informed by primary documentation for [Kinovea annotation tools](https://www.kinovea.org/help/en/annotation/tools.html), [editable drawings and key images](https://kinovea.readthedocs.io/en/latest/annotation/annotations.html), [drawing persistence](https://kinovea.readthedocs.io/en/latest/userinterface/preferences/drawings.html), [image-plane angle limitations](https://www.kinovea.org/help/en/measurement/angle.html), and [Onform's drawing and comparison tools](https://onform.com/blog/analysis-tools-webinar/). It does not implement automatic tracking of hand-drawn objects.

Implementation: `deploy/drawing.js` contains pure annotation geometry, history and rendering; `deploy/annotations.js` owns the toolbar, pointer interactions, per-clip state and PNG export. Unit tests cover coordinate transforms, angle geometry, bounds, visibility, hit-testing and history. Browser tests exercise drawing, editing, copying, export, touch, mirroring, resizing and clip replacement.

## Zoom and pan

The studio fills one browser viewport. Opening a video brings it into view; native scroll snapping lands on the studio when scrolling from the introduction or guide. The page can still scroll to those sections. Shared playback and Analyze/Cancel remain at the bottom; Sync off moves playback controls to their respective videos. Draw, Video, Range, Results and Moments tabs expose the selected controls within that screen. Tabs support arrow keys; Escape closes the panel. At unusually small sizes or high browser text zoom, a panel can scroll internally so controls remain accessible.

Video frames use the remaining width and height, including large and ultrawide monitors. Panels start closed and a persistent Help button explains the three main tasks. The desktop inspector keeps its compact width so extra space goes to the videos. Resizing preserves the open panel. Resizing and opening panels preserve playback, zoom and drawing alignment.

Each video has its own **− / +** buttons and **Zoom** slider, from **1× (Fit) to 4×**. Zooming or panning does not pause playback. The view is retained when playing, pausing, changing speed, scrubbing, stepping, running analysis, switching modes, or resizing the window. The two comparison videos keep independent views even when their playback is linked.

When zoomed and using **View**, drag the video to pan. **Pan** returns from a drawing tool to view movement without pausing the video; press it again to disable dragging. Pinch with two fingers while Pan is active, or use Ctrl/⌘ + scroll over the video to zoom around the pointer. Ordinary scrolling moves between the page's snap sections; Ctrl/⌘ + scroll remains dedicated to video zoom. **Fit** restores 1× and centers that clip. Loading a replacement clip resets only its own view.

The video, pose overlay, and manual drawings share one transformed image plane, so drawing and editing work at any magnification. Exported PNGs show the current zoomed crop (including pan and mirroring); JSON exports include the normalized view center and zoom. This is display magnification, not an increase in the source video's resolution. Session views are not retained after a page reload.

`deploy/viewport.js` contains bounded view geometry, controls, and mouse/touch interactions. Tests verify playback persistence, independent comparison views, pointer-anchored zoom, pan bounds, frame stepping, resizing, mirror/drawing alignment, touch gestures, and image export.

Removing or replacing a clip with drawings, moments or analysis asks before clearing its work. Cancel keeps the current clip and its state. This protects against accidental changes; it does not save a session across page reloads. **View results** opens completed analysis, and the **Results** tab explains how to begin when no analysis exists.
