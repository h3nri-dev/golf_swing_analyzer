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

Browser tests use installed Google Chrome for MP4 support. Set `PLAYWRIGHT_CHANNEL` to another installed supported browser channel if needed. For optional real inference verification, set `POSE_FIXTURE=/absolute/path/to/video.mp4` before `npm run test:browser`; the clip should show a clearly visible person for at least 0.3 seconds. This test downloads the actual model, verifies nonempty measurements, and asserts that no POST/upload requests occur. The checked-in fixtures are synthetic videos, not user footage. PDF tests also verify local generation, frame restoration, cancellation and retry.

## UX design

See [UX_REVIEW.md](UX_REVIEW.md) for the task review, research sources, observed problems, changes and remaining user-validation work.

## Using the studio

- **Single video:** choose a local clip, pause at your swing, then choose **Analyze**. By default it scans five real seconds before and after that frame, clipped at the video’s edges. Use **Results** to select your playing hand and inspect pose landmarks, the lead-hand trail and image-plane joint angles.
- **Compare videos:** load A and B. **Sync on** plays and steps both clips together. Choose **Sync off**, move each clip to the same event (usually impact), then choose **Sync Videos**. This pauses both clips and aligns their currently displayed frames in one click, including when sync is already on. Press Play both to resume. Synchronized playback is constrained to the overlapping range and stops when either clip reaches the end.
- **Individual players:** each comparison video always shows its own play/pause, timeline, elapsed/total time, previous/next frame, speed and restart. These playback controls affect only that clip and turn Sync off when necessary, leaving the other video playing. With Sync off, local actions do not change the common controller's play button, slider, clock or speed. Zoom remains independent without changing sync.
- **Common controller:** Sync on/off and **Sync Videos** sit next to each other directly above the common timeline and playback buttons, below both videos. This controller always operates on both. With Sync on it preserves the alignment offset and shared playback limits. With Sync off, Play both starts both at their current positions and speeds, including when one is already playing. Pause both pauses both; frame stepping advances each by its own frame rate, and seeking moves both by the same time change until a clip reaches its boundary. The timeline clock identifies A or B and remains fixed when selecting another clip with Sync off. Restart uses the shared range start when linked, otherwise each clip’s beginning; the common speed selector sets both rates. Common controls become available when both files are loaded. After individual playback takes over, the common controller retains its last group state until you use it again. A new common command refreshes it from the pair, displaying Mixed when their speeds differ, and resumes live updates during group playback.
- **Sync on/off:** turning sync off preserves current playback and zoom. Turning it on pauses and aligns both at the selected clip’s position within the shared range, preserves the alignment offset, and uses the selected clip’s speed; press Play both to resume. With sync off, marking, replacing or reaching the end of one clip leaves the other playing.
- Select a clip using its A/B badge or its card. The selection chooses the drawing, analysis and moment-marker target; the bottom playback controller still acts on both videos.
- Each player has **File FPS** and **Shot FPS** beside its playback controls. Use **Video** for mirror, Pan or Fit. Speed lives beside the appropriate playback controls. Arrow keys step and Space toggles playback when focus is outside interactive controls.
- **Moments beside Play A / Play B:** choose a saved moment to jump straight to its frame, choose an unmarked phase to add it, or choose **Add / edit moments**. The nearby editor lets you enter an exact frame number, use **Set here**, or delete a mark. The first frame is 0. On narrow phones the menu uses a flag icon. Single mode puts the same menu beside its Play button. Individual marker actions affect their own clip and release sync. The expanded sidebar still offers address, top, impact and finish shortcuts. Ordered marks produce the backswing-to-downswing tempo ratio.
- Video decoding depends on the browser and codec. H.264 MP4 and WebM are recommended. A MOV extension alone does not guarantee support.

## Frame rates and slow-motion comparison

Set **File FPS** to each file's encoded frame rate. It defaults to 30; it is not automatically detected. Leave **Shot FPS** at **Same** for ordinary videos. For a constant-rate slow-motion export, choose the original camera recording rate in Shot FPS. For example:

| Footage | File FPS | Shot FPS | Playback at 1× real time |
| --- | --- | --- | --- |
| Normal 30 FPS | 30 | Same | 1× file speed |
| Normal 60 FPS | 60 | Same | 1× file speed |
| Recorded at 120 FPS, slowed to 30 FPS | 30 | 120 | 4× file speed |

Position both clips at a shared event and choose **Sync Videos**. Linked playback and seeking preserve that event's offset on a common real-time clock. Shared frame steps use the lower recording rate: with ordinary 30/60 FPS clips, one step spans one frame of A and two of B. Selecting a different clip does not change this interval. Independent controls still step one file frame at a time and release sync. All speed selectors apply to real time after the FPS settings, so choosing 0.25× slows both calibrated clips equally.

Changing timing preserves the actual moment frames, drawings and analyzed samples; the stored alignment frames recalculate the common offset. **Clocks, slider values, range inputs, moment labels, tempo durations and PDF timestamps use real elapsed seconds**, with three decimal places. Video labels also show the frame number (`F60` means frame 60, counting from 0). A 120 FPS recording saved at 30 FPS therefore shows frame 60 at 0.500 real seconds. Marks snap to a file frame. Internal media coordinates remain in file seconds so retiming does not move saved work. Replacing a clip resets only that clip's timing settings.

The rate correction assumes a constant slow-motion factor. Keep Shot FPS at Same if an export already plays at real speed, even if the camera originally recorded at a higher rate. Variable-speed edits need to be exported as a constant-speed section first. Variable-frame-rate files and browser seeking do not guarantee exact encoded-frame access; stepping is time-based at the selected rates.

Timing follows the distinction between file and capture rates described in [Kinovea's time calibration](https://www.kinovea.org/help/en/measurement/time.html) and [synchronized comparison](https://www.kinovea.org/help/en/observation/comparison.html). Browser seek positions use [media time in seconds](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime).

## Selecting an analysis range

The expanded **Analyze range** row sits immediately above the common player bar. Its A/B selector, boundary controls and Analyze/Cancel buttons stay together. Draw, Video, Results and Moments remain expanded in the right sidebar. By default, **Follow ±5s** is on: the highlighted window follows the current frame and selects five real seconds on either side. At the clip’s edges the window becomes shorter; clips under five seconds are selected in full. Clicking Analyze captures that window and keeps it fixed throughout the scan.

Drag the single broad window handle to move the selection and pin it without moving or pausing the video. Arrow keys move the window by one real second, Shift + arrow by one recorded frame, and Page Up/Down by five seconds. Home/End move its center to the clip’s edges. Choose **Follow ±5s** to return to automatic selection; clicking it while following pins the current window. Exact start/end fields remain available for custom selections of up to **20 real seconds**. Editing a field pins the range; sliding a custom range retains its chosen length except where the clip’s edges shorten it. You can also pause or step to a moment and choose **Set** for Start or End. **Go** beside Start or End pins the selection and revisits that boundary. The playhead remains visible on the range bar.

Each comparison clip keeps its own selection, even with synchronized playback. Range previews can inspect the selected clip outside the pair's shared playback interval; normal synchronized playback still uses the shared interval. Automatic windows use File FPS / Shot FPS to select real elapsed seconds. Pinned selections keep their stored file frames when timing changes. Empty, reversed, out-of-bounds or overlong ranges show an inline explanation and disable analysis until corrected.

Changing the range preserves earlier results and marks, with a reminder to analyze again. PDF reports identify the selected and analyzed intervals separately, so earlier results are not mistaken for a newly selected range. Cancelling an analysis preserves previous results and their original interval. Analysis restores the playhead and retains zoom and drawings. The 240-sample processing cap also applies to slow-motion footage.

## Analysis and privacy

The app lazy-loads pinned MediaPipe Tasks Vision 0.10.21 and the Pose Landmarker Lite model. Code/WASM comes from jsDelivr and model weights come from Google's public storage; **video pixels stay in browser memory**. A network connection is required for uncached model assets. Regular video review works without the model. Fonts are served locally and there is no video upload endpoint.

Optional Google Analytics uses the original property **G-MG3PW4FRFM**. `consent.js` implements [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode): it loads no Google tag until the visitor opts in. The original `golf_cookie_consent` local-storage choices remain valid; missing, malformed or unavailable storage defaults to off. Ad storage, ad user data, ad personalization and Google signals remain disabled. The explicit page view uses a URL without query/fragment and a referrer origin only. The application does not add local filenames, videos, drawings or measurements to analytics events. Analytics blockers or storage failures must never prevent video review.

Cookie settings are always available in the footer and workspace Help. Withdrawal immediately sets Google's [analytics opt-out flag](https://developers.google.com/tag-platform/security/guides/privacy), updates consent and expires accessible first-party GA cookies without reloading the app. Changes propagate to other open tabs. Withdrawal does not delete previously collected data. The first-visit choice sits beside the introduction, outside the players. [Privacy Policy](https://freegolfswinganalyzer.com/privacy.html) and [Terms & conditions](https://freegolfswinganalyzer.com/terms.html) are standalone static pages; studio links open them separately to preserve the swing session. Their wording restores the original policies with current implementation details, without asserting an unverified GA retention configuration.

The existing Cloudflare Pages host separately injects its own cookie-free web analytics beacon for page visits and performance data. This hosting service is disclosed in the privacy policy and is not controlled by the Google Analytics preference. It receives no video content or swing measurements. Browser consent tests stub Google's script so test visits do not pollute the production analytics property; normal model/PDF tests run with Google Analytics off.

Each run uses a fresh CPU model, scans at up to 30 samples per file second with a maximum of 240 samples, and downscales inference images to a 640-pixel longest edge. Model timestamps are calibrated to real elapsed time. Analysis yields between samples, supports cancellation (including stalled model initialization), times out stalled downloads/seeks, and preserves prior results when cancelled. Object URLs are revoked when clips are replaced or removed.

Measurements require landmark visibility of at least 0.65. Pixel-space geometry corrects for aspect ratio. A three-sample median suppresses isolated jitter without inventing landmarks in missing frames. The overlay chooses only nearby samples and does not bridge missing hand-path observations. Pose coverage is the fraction of sampled frames with visible shoulders and hips, not a quality score.

Elbow and knee angles and torso lean are **2D estimates**, influenced by viewpoint, clothing, occlusion and motion blur. They are not 3D rotation measurements, ball-flight predictions or professional coaching. Swing phases are user-marked; tempo is not an inferred skill rating. The legacy minified heuristic club/ball detection and numerical swing ratings have been removed in favor of these inspectable measurements.

References: [MediaPipe web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [PoseLandmarker API](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.poselandmarker).

## Source layout

- `deploy/index.html` — semantic layout, single/compare modes, privacy details.
- `deploy/consent.js`, `consent.css` — consent-gated GA4, cookie choices and cross-tab withdrawal.
- `deploy/privacy.html`, `terms.html`, `legal.css` — full privacy policy and terms, with readable standalone layouts.
- `deploy/styles.css` — base studio design.
- `deploy/screen.js`, `deploy/screen.css`, `deploy/sidebar.css`, `deploy/review-layout.css` — viewport workspace, permanent expanded sidebar and scroll snapping.
- `deploy/ux.js`, `deploy/ux.css` — task help, session-work confirmation and interaction refinements.
- `deploy/app.js` — file lifecycle, playback, synchronized seeking, overlays, lazy inference and exports.
- `deploy/analysis.js` — pure geometry, confidence filtering, smoothing, timing helpers.
- `deploy/timing.js` — recording/file FPS conversion, clocks, frame numbering, stepping and overlapping playback limits.
- `deploy/moments.js` — per-player moment menus and frame editor.
- `deploy/report.js`, `deploy/vendor/` — local PDF report layout and pinned jsPDF browser library.
- `deploy/range.js` — range selection, boundary previews and validation.
- `deploy/fonts/` — locally hosted DM Sans and Manrope, with their OFL licenses.
- `tests/` — unit and browser tests plus generated fixtures.

Cloudflare Pages deploys the static directory to `freegolfswinganalyzer`, branch `main`. The existing custom domain is retained. No Cloudflare Functions or Workers run for analysis.

## Saving a PDF report

Choose **Save PDF report** in the expanded Moments section. Single mode creates a two-page report; comparison creates a three-page report containing both loaded clips. No analysis or marker is required to export.

- The overview includes the current annotated frame(s), filenames, File FPS / Shot FPS, real elapsed time, frame numbers, zoom, mirroring, current pose measurements, selected/analyzed ranges and tempo.
- Each swing gets a page with address, top, impact and finish images, a table of measurements at those marked frames, pose coverage and calibrated backswing/downswing durations. Missing marks or low-confidence measurements are clearly shown as unavailable.
- The report includes the visible drawing and pose settings. Export pauses playback, captures decoded frames, then restores the original playheads and views. You can cancel; a failed export leaves the studio usable and can be retried.
- PDF generation uses the locally hosted, pinned jsPDF 4.2.1 browser build. No video, frame, filename or report content is uploaded. The app downloads a PDF directly, with searchable report text and browser-rendered filenames for non-Latin characters. It does not require a print dialog or a backend.

A PDF is a readable review, not an editable session backup. Reloading the site still clears the session. See [jsPDF's official documentation](https://github.com/parallax/jsPDF) for the underlying PDF library.

## Drawing and comparison

The vertical **Draw** rail stays beside the videos, on desktop and phone. Short screens use labeled-on-hover icons, and landscape phones use two narrow tool columns. Choose **Pen**, **Line**, **Arrow**, **Circle** (an adjustable ellipse), or **Angle**, then draw directly on either loaded video. Undo and Redo are in the same rail. Drawing pauses the clip being edited; with Sync off, the other clip can keep playing. For an angle, tap/click the first endpoint, the joint/vertex, and the other endpoint; the label is an image-plane angle in degrees.

The expanded **Draw** section contains color, stroke, visibility duration, copy, hide, delete and image export. The A/B badge on each card or the sidebar's Editing selector chooses the target for drawing, video settings, range, results and moments. Comparison always shows individual players beneath the videos and a common controller below the pair. All sections stay open; there are no tabs or panels to close. Escape cancels the current drawing or returns to View.

- **Select** moves an existing drawing; white handles adjust endpoints and circle bounds. Pen strokes move as one object. The color and stroke selectors also edit a selected shape.
- **Entire clip** keeps reference drawings visible throughout playback. **This frame** attaches a drawing to the current timestamp with a half-frame tolerance based on the selected source FPS. The **Choose a frame** menu revisits these moments.
- **Copy visible to A/B** copies the current visible drawings to the other clip. If a drawing is selected, only that drawing is copied. Positions are relative to the image, so different camera views may need manual adjustment with Select. A frame-scoped copy belongs to the destination's current time.
- Each video has its own undo/redo history (50 edits). Clear, delete, copy and style changes can all be undone. Use Ctrl/⌘ Z, Ctrl/⌘ Shift Z, Delete, or Escape (cancel the current drawing / return to View).
- **Hide drawings** temporarily hides only manual annotations. Pose overlays remain independently controllable. **View** allows regular viewing; playing a video exits the drawing tool.
- **Save image / Save comparison** downloads the currently displayed frame(s), visible drawings and pose overlays as a PNG. This is a still image, not an annotated video recording. The PDF report also includes annotated frames and moment measurements. Importing a saved session is not implemented. Refreshing or replacing a clip clears its drawings.

Annotations are vector data in normalized, unmirrored video coordinates. Pointer events handle mouse, touch and pen input. The drawing layer fits the actual video image, supports high-DPI screens, and remains aligned through resizing, portrait/landscape media and mirroring. Text on angle labels remains readable when mirrored. Export composes local frames and overlays in the browser; nothing is uploaded.

The workflow was informed by primary documentation for [Kinovea annotation tools](https://www.kinovea.org/help/en/annotation/tools.html), [editable drawings and key images](https://kinovea.readthedocs.io/en/latest/annotation/annotations.html), [drawing persistence](https://kinovea.readthedocs.io/en/latest/userinterface/preferences/drawings.html), [image-plane angle limitations](https://www.kinovea.org/help/en/measurement/angle.html), and [Onform's drawing and comparison tools](https://onform.com/blog/analysis-tools-webinar/). It does not implement automatic tracking of hand-drawn objects.

Implementation: `deploy/drawing.js` contains pure annotation geometry, history and rendering; `deploy/annotations.js` owns the toolbar, pointer interactions, per-clip state and PNG export. Unit tests cover coordinate transforms, angle geometry, bounds, visibility, hit-testing and history. Browser tests exercise drawing, editing, copying, export, touch, mirroring, resizing and clip replacement.

## Zoom and pan

On desktop the studio fills one browser viewport. Opening a video brings it into view; native scroll snapping lands on the studio when scrolling from the introduction. **The page ends at the studio**, so downward scrolling cannot move the players offscreen into a marketing or guide section. The former lower guide is in **About**, available beside the logo/domain after Single/Compare, in the top header and in Help. Its dialog closes without losing the video session or zoom. The logo and **FreeGolfSwingAnalyzer.com** also appear in each video’s lower corner, outside the zoom/mirror layer, with pointer events disabled so drawing still works through the mark. Playback clocks remain beside each timeline.

Privacy, terms and cookie settings remain visible in the existing desktop status row. The range row and Analyze/Cancel sit directly above common playback. Draw, Video, Results and Moments are permanently expanded in the right column. Each section has a heading and ordinary keyboard navigation. On shorter screens or at high text zoom, the sidebar scrolls independently without moving the video players. At 900 CSS pixels wide or less, expanded sections and legal links follow the players, with proximity snapping and a minimum video-area height so every control stays reachable without flattening the footage.

Video frames use the remaining width and height, including large and ultrawide monitors. The sidebar uses two columns of compact cards on wider screens and one column on narrower screens. A persistent Help button explains the three main tasks and focuses the appropriate section. Resizing and moving between sections preserve playback, zoom and drawing alignment.

Each video has its own **− / +** buttons and compact **Zoom** slider, from **1× (Fit) to 4×**. The slider is capped at 112 pixels and shrinks on narrow screens, keeping the buttons and zoom value together. Zooming or panning does not pause playback. The view is retained when playing, pausing, changing speed, scrubbing, stepping, running analysis, switching modes, or resizing the window. The two comparison videos keep independent views even when their playback is linked.

When zoomed and using **View**, drag the video to pan. **Pan** returns from a drawing tool to view movement without pausing the video; press it again to disable dragging. Pinch with two fingers while Pan is active, or use Ctrl/⌘ + scroll over the video to zoom around the pointer. Ordinary scrolling reaches the workspace from the introduction and stops there on desktop; Ctrl/⌘ + scroll remains dedicated to video zoom. **Fit** restores 1× and centers that clip. Loading a replacement clip resets only its own view.

The video, pose overlay, and manual drawings share one transformed image plane, so drawing and editing work at any magnification. Exported PNGs show the current zoomed crop (including pan and mirroring); PDF reports include the zoomed view and state its magnification. This is display magnification, not an increase in the source video's resolution. Session views are not retained after a page reload.

`deploy/viewport.js` contains bounded view geometry, controls, and mouse/touch interactions. Tests verify playback persistence, independent comparison views, pointer-anchored zoom, pan bounds, frame stepping, resizing, mirror/drawing alignment, touch gestures, and image export.

Removing or replacing a clip with drawings, moments or analysis asks before clearing its work. Cancel keeps the current clip and its state. This protects against accidental changes; it does not save a session across page reloads. **View results** focuses completed analysis in the sidebar, and the **Results** section explains how to begin when no analysis exists.

## Visual key moments

After **Analyze**, six visual previews appear alongside the player: Address, Top of backswing, Downswing, Impact, Follow-through and Finish. Portrait videos use a tall player beside a two-column gallery on wide desktops. Landscape videos use a filmstrip below the player; comparison pairs A/B images for each moment. Phones place the gallery after playback controls, followed by the expanded sidebar sections.

Click an image to jump that player to its frame. **Enlarge & edit** (or a card heading) opens a large single/paired view with frame numbers, real-time timestamps, available angles, previous/next frame, Set from player, Play from here and Draw on frame. Editing a frame saves a manual mark. The Moments menus beside Play also jump to the previews. The six-moment editor includes Downswing and Follow-through; the sidebar retains the four primary marks used for tempo. User marks override suggestions and survive reanalysis and FPS changes.

Phase suggestions use a confidence-gated, torso-relative rise/drop/rise of the hands, with bounded gaps and ordered frames. These are explicitly labeled **Estimate**, not verified ball contact or a trained golf-event detector. Short, static, occluded or incomplete swings get six labeled **Range previews** instead. Analysis does not automatically set tempo from uncertain suggestions. Tightening the analysis range around one complete swing improves the chance of useful estimates.

`deploy/keyframes.js` contains pure selection/merge logic. `deploy/keyframe-views.js` decodes only the needed thumbnails using separate local video elements, so thumbnail preparation never seeks the main players or changes synchronization. Canvas caches are bounded and released on replacement. Views show the full frame with the current mirror, pose visibility and applicable drawings; the main player's zoom is preserved separately. PDF reports include an additional visual-moments page with source labels and annotated frames. No video or image leaves the device.

Related controls stay close: Fit is beside each compact zoom slider, Undo/Redo follow the vertical drawing tools, and Sync on/off and Sync Videos precede common playback. On very short phones the range/playback group follows a minimum-height video area, so footage remains usable and every control is reachable by scrolling.
