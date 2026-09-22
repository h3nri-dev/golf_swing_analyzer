# FreeGolfSwingAnalyzer.com

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

The [original feature audit](ORIGINAL_FEATURE_AUDIT.md) documents recovered capabilities and deliberate replacements for unsupported scoring. See [UX_REVIEW.md](UX_REVIEW.md) for the task review, research sources, observed problems, changes and remaining user-validation work.

## Using the studio

- **Single video:** choose a local clip, pause at your swing, then choose **Analyze**. By default it scans 2.5 real seconds before and after that frame, clipped at the video’s edges. Use **Results** to select your playing hand and inspect all eight image angles, phase observations and head/both-hand paths.
- **Compare videos:** load A and B. **Sync on** plays and steps both clips together. Choose **Sync off**, move each clip to the same event (usually impact), then choose **Sync Videos**. This pauses both clips and aligns their currently displayed frames in one click, including when sync is already on. Press Play both to resume. Synchronized playback is constrained to the overlapping range and stops when either clip reaches the end.
- **Individual players:** each comparison video always shows its own play/pause, timeline, elapsed/total time, previous/next frame, **−1s / +1s**, speed and restart. These playback controls affect only that clip and turn Sync off when necessary, leaving the other video playing. With Sync off, local actions do not change the common controller's play button, slider, clock or speed. Zoom remains independent without changing sync.
- **Common controller:** Sync on/off and **Sync Videos** sit next to each other directly above the common timeline and playback buttons, below both videos. This controller always operates on both. With Sync on it preserves the alignment offset and shared playback limits. With Sync off, Play both starts both at their current positions and speeds, including when one is already playing. Pause both pauses both; frame stepping advances each by its own frame rate, and seeking moves both by the same time change until a clip reaches its boundary. The timeline clock identifies A or B and remains fixed when selecting another clip with Sync off. Restart uses the shared range start when linked, otherwise each clip’s beginning; the common speed selector sets both rates. Common controls become available when both files are loaded. After individual playback takes over, the common controller retains its last group state until you use it again. A new common command refreshes it from the pair, displaying Mixed when their speeds differ, and resumes live updates during group playback.
- **One-second jumps:** **−1s / +1s** sit beside the frame/play buttons on the single player, individual comparison players and common controller. Each jump moves one real second using File FPS / Shot FPS, keeps playing clips playing and paused clips paused, and stops at the clip or shared playback boundary. Individual jumps leave the other player and common display alone.
- **Sync on/off:** turning sync off preserves current playback and zoom. Turning it on pauses and aligns both at the selected clip’s position within the shared range, preserves the alignment offset, and uses the selected clip’s speed; press Play both to resume. With sync off, marking, replacing or reaching the end of one clip leaves the other playing.
- Select a clip using its A/B badge or its card. The selection chooses the drawing, analysis and moment-marker target; the bottom playback controller still acts on both videos.
- Each player has **File FPS** and **Shot FPS** beside its playback controls. Use **Video** for mirror, Pan or Fit. Speed lives beside the appropriate playback controls. Arrow keys step and Space toggles playback when focus is outside interactive controls.
- **Visible moment cards:** Address, Backswing, Top of backswing, Downswing, Impact, Follow-through and Finish stay beside/below the players. Analyze finds them automatically; click a preview to jump, or use its adjacent **Set A / Set B** button to mark the displayed player frame in one click. **Edit A / Edit B** opens exact frame editing and reset. Matching phase colors and numbers connect all views. Individual marking/jumping affects its own clip and releases sync; the other clip keeps playing independently. Automatic and manual phases both contribute to tempo; range previews do not. Manual edits take priority until a new analysis completes.
- Video decoding depends on the browser and codec. H.264 MP4 and WebM are recommended. A MOV extension alone does not guarantee support.

## Frame rates and slow-motion comparison

**File FPS is detected automatically** when you open or replace each video. Its status appears directly below the FPS controls. Detection reads the video stream locally in a background worker; it does not play or upload the file. MP4, MOV and WebM are supported, including fractional and high frame rates. You can always correct the File FPS selector manually, including choosing a detected rate outside the standard presets.

Variable-rate files show **Variable FPS**, using their average rate for approximate stepping. If metadata is missing, unsupported, or cannot be read promptly, **Choose File FPS** appears; 30 is a temporary fallback until you choose the correct rate. Detection finishes before playback controls become available, so a late result cannot override your edits or change timing during playback/analysis. Replacing/removing a clip cancels its old detection.

Leave **Shot FPS** at **Same** for ordinary videos. File metadata does not reliably identify the camera’s original recording rate: for a constant-rate slow-motion export, choose that rate in Shot FPS. For example:

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

The playback scrubber also selects the analysis interval. Its translucent light-green band covers **2.5 real seconds before and after the current frame**, with a tall vertical playhead in the middle. Drag anywhere on the 48-pixel-high bar to seek and move the window together; it continues following during playback. Clip edges shorten the window. **Analyze** sits immediately after **Speed**, with a matching action in each comparison player's controls. The common controller has an adjacent A/B analysis target.

There are no separate start/end fields, range slider or pin/follow toggle. Arrow keys on a focused scrubber move one file frame; Shift + arrow and Page Up/Down move one real second. Home/End seek to the displayed timeline's edges. File FPS / Shot FPS immediately recalibrate the window in both modes, including the independent common controller. A 120 FPS recording saved at 30 FPS has a window spanning 20 file seconds (five real seconds); changing File FPS to 60 reduces that to 10 file seconds. Ordinary 30/60 FPS clips both cover five real seconds. Both clips maintain their own following windows. With Sync off, local playback leaves the common clock, window and playback state unchanged. Explicit FPS edits update the common window's scale only when that clip supplies its clock, preserving its saved file position and playback state.

Analyze captures the window at the moment it is clicked and freezes it during scanning. Export also preserves the selection while capturing its frames. Loop window captures a separate fixed interval for playback; the green analysis window keeps following the current frame. Click Loop window again to stop repeating.

Changing the range preserves earlier results and marks, with a reminder to analyze again. PDF reports identify the selected and analyzed intervals separately, so earlier results are not mistaken for a newly selected range. A completed analysis replaces that video’s old markers, including manual edits, with its new results. If no swing is detected, the new frames are labeled range previews rather than retaining old phase markers. Cancelling or failing an analysis preserves previous results, marks and their original interval. The other comparison video’s markers are unchanged. Analysis restores the playhead and retains zoom and drawings. The processing cap also applies to slow-motion footage: 240 samples in Fast or 2,400 in Detailed.

After analyzing part of a clip, its playback timeline automatically expands to that **Analyzed range**. Start/end times and magnification appear beside the timeline. Numbered, color-coded markers match the seven moment cards; nearby labels spread apart with lines pointing to their exact timestamps. Click a marker to jump to its frame. **Full video** restores the overview, and **Analyzed range** returns to the expanded view without moving the playhead or changing video zoom. The review window stays fixed during playback and while the next analysis selection follows the playhead. If playback moves beyond it, the common clock says **Outside range**; Full video reveals the playhead again. Cancellation retains the previous review window.

Comparison keeps a separate timeline view for each player. Local markers control one video; the common timeline's markers control both using their calibrated real-time offset. Completing analysis makes the analyzed clip the common review clock. Subsequent individual playback with Sync off leaves that common clock and view unchanged. Expanded timelines keep numbered markers and adjacent Analyzed range / Full video buttons. Short desktop screens use compact local phase dots with leaders to their exact frame anchors; the common timeline retains numbered markers.

## Understand your results

FreeGolfSwingAnalyzer.com watermarks appear on the players, every keyframe preview and enlarged popup, and each image in PNG/PDF exports. They remain upright when the footage is mirrored, follow the visible crop, and remain present when drawings or pose overlays are hidden.

Open **Analysis** beside **Set** on a keyframe. Suggestions explain **Looks good**, **Check this** and **Try next** before the numbers. Findings compare visible movement within your own swing; uncertain phases or missing tracking get clear next steps instead of an invented judgment. The enlarged view and every PDF frame page include the same feedback. See [the feedback rules, coaching sources and limitations](COACHING_REVIEW.md).

## Analysis and privacy

The app lazy-loads pinned MediaPipe Tasks Vision 0.10.21 and the Pose Landmarker Lite model. Code/WASM comes from jsDelivr and model weights come from Google's public storage; **video pixels stay in browser memory**. A network connection is required for uncached model assets. Regular video review works without the model. Fonts are served locally and there is no video upload endpoint.

Optional Google Analytics uses the original property **G-MG3PW4FRFM**. `consent.js` implements [basic consent mode](https://developers.google.com/tag-platform/security/concepts/consent-mode): it loads no Google tag until the visitor opts in. The original `golf_cookie_consent` local-storage choices remain valid; missing, malformed or unavailable storage defaults to off. Ad storage, ad user data, ad personalization and Google signals remain disabled. The explicit page view uses a URL without query/fragment and a referrer origin only. The application does not add local filenames, videos, drawings or measurements to analytics events. Analytics blockers or storage failures must never prevent video review.

Cookie settings are always available in the footer and workspace Help. Withdrawal immediately sets Google's [analytics opt-out flag](https://developers.google.com/tag-platform/security/guides/privacy), updates consent and expires accessible first-party GA cookies without reloading the app. Changes propagate to other open tabs. Withdrawal does not delete previously collected data. The first-visit choice sits beside the introduction, outside the players. [Privacy Policy](https://freegolfswinganalyzer.com/privacy.html) and [Terms & conditions](https://freegolfswinganalyzer.com/terms.html) are standalone static pages; studio links open them separately to preserve the swing session. Their wording restores the original policies with current implementation details, without asserting an unverified GA retention configuration.

The existing Cloudflare Pages host separately injects its own cookie-free web analytics beacon for page visits and performance data. This hosting service is disclosed in the privacy policy and is not controlled by the Google Analytics preference. It receives no video content or swing measurements. Browser consent tests stub Google's script so test visits do not pollute the production analytics property; normal model/PDF tests run with Google Analytics off.

Each run uses a fresh CPU model. Fast scans up to 30 samples per file second, at most 240 samples, and a 640-pixel longest edge. Detailed uses the Heavy model at File FPS, at most 2,400 samples, and a 960-pixel longest edge. Model timestamps are calibrated to real elapsed time. Analysis yields between samples, supports cancellation (including stalled model initialization), times out stalled downloads/seeks, and preserves prior results when cancelled. Object URLs are revoked when clips are replaced or removed.

Measurements require landmark visibility of at least 0.65. Pixel-space geometry corrects for aspect ratio. A three-sample median suppresses isolated jitter without inventing landmarks in missing frames. The overlay chooses only nearby samples and does not bridge missing hand-path observations. Pose coverage is the fraction of sampled frames with visible shoulders and hips, not a quality score.

Elbow and knee angles and torso lean are **2D estimates**, influenced by viewpoint, clothing, occlusion and motion blur. They are not 3D rotation measurements, ball-flight predictions or professional coaching. Swing phases are automatically estimated from hand movement and remain editable; tempo is not an inferred skill rating. The legacy minified heuristic club/ball detection and numerical swing ratings have been removed in favor of these inspectable measurements.

References: [MediaPipe web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [PoseLandmarker API](https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.poselandmarker).

## Source layout

- `deploy/index.html` — semantic layout, single/compare modes, privacy details.
- `deploy/consent.js`, `consent.css` — consent-gated GA4, cookie choices and cross-tab withdrawal.
- `deploy/privacy.html`, `terms.html`, `legal.css` — full privacy policy and terms, with readable standalone layouts.
- `deploy/styles.css` — base studio design.
- `deploy/favicon.svg` — shared golf-ball-and-tee logo with a swing arc, used in the browser tab, site/legal headers, workspace header, About and video branding. Keep it as a local vector so it stays sharp at small sizes.
- `deploy/screen.js`, `deploy/screen.css`, `deploy/sidebar.css`, `deploy/review-layout.css` — viewport workspace, permanent expanded sidebar and scroll snapping.
- `deploy/ux.js`, `deploy/ux.css` — task help, session-work confirmation and interaction refinements.
- `deploy/app.js` — file lifecycle, playback, synchronized seeking, overlays, lazy inference and exports.
- `deploy/analysis.js` — pure geometry, confidence filtering, smoothing, timing helpers.
- `deploy/timing.js` — recording/file FPS conversion, clocks, frame numbering, stepping and overlapping playback limits.
- `deploy/file-fps.js`, `file-fps-worker.js`, `vendor/mediainfo/` — automatic local file-rate detection using pinned MediaInfo.js 0.3.8, limited to 10 seconds and 32 MiB of chunk reads. No full-file buffer or backend. See [MediaInfo.js usage](https://mediainfo.js.org/docs/getting-started/usage/) and [MediaInfo’s stream fields](https://mediaarea.net/en/MediaInfo/Support/Fields).
- `deploy/moments.js` — local marker actions and exact frame editor.
- `deploy/report.js`, `deploy/vendor/` — local PDF report layout and pinned jsPDF browser library.
- `deploy/range.js` — following analysis windows and validation.
- `deploy/fonts/` — locally hosted DM Sans and Manrope, with their OFL licenses.
- `tests/` — unit and browser tests plus generated fixtures.

Cloudflare Pages deploys the static directory to `freegolfswinganalyzer`, branch `main`. The existing custom domain is retained. No Cloudflare Functions or Workers run for analysis.

## Saving a PDF report

Choose **Save PDF report** in the expanded Tempo & report section. Every captured image gets its own page: one current frame per loaded video, then one page per available key moment. An analyzed swing with seven moments produces eight pages; two analyzed swings produce sixteen. Without analysis or marks, there is just one page per video. No empty moment pages or duplicate contact sheets are added.

- Frames fill a large, aspect-correct print area, with portrait/landscape pages selected to suit the image. Captures remove empty player margins, retain the visible zoom/pan/crop and use a 2,000-pixel long edge. Every frame carries a **FreeGolfSwingAnalyzer.com** watermark.
- Each image's page includes its own eight 2D measurements, changes from address, phase guidance and measured observations, filename, phase/source, real elapsed time, zero-based frame number, File FPS / Shot FPS, zoom/mirroring, selected/analyzed ranges, coverage and calibrated swing tempo. Its results come from the same frame analysis as the gallery and enlarged view, with every finding printed. Missing tracking or an unset address remains unavailable. Manual marks, automatic estimates and sampled previews stay distinct.
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

Privacy, terms and cookie settings remain visible in the existing desktop status row. The analysis window shares the playback scrubber; Analyze/Cancel sit after Speed in the common playback row. Draw, Video, Results and Moments are permanently expanded in the right column. Each section has a heading and ordinary keyboard navigation. On shorter screens or at high text zoom, the sidebar scrolls independently without moving the video players. At 900 CSS pixels wide or less, expanded sections and legal links follow the players, with proximity snapping and a minimum video-area height so every control stays reachable without flattening the footage.

Video frames use the remaining width and height, including large and ultrawide monitors. The sidebar uses two columns of compact cards on wider screens and one column on narrower screens. A persistent Help button explains the three main tasks and focuses the appropriate section. Resizing and moving between sections preserve playback, zoom and drawing alignment.

Each video has its own **− / +** buttons and compact **Zoom** slider, from **1× (Fit) to 4×**. The slider is capped at 112 pixels and shrinks on narrow screens, keeping the buttons and zoom value together. Zooming or panning does not pause playback. The view is retained when playing, pausing, changing speed, scrubbing, stepping, running analysis, switching modes, or resizing the window. The two comparison videos keep independent views even when their playback is linked.

When zoomed and using **View**, drag the video to pan. **Pan** returns from a drawing tool to view movement without pausing the video; press it again to disable dragging. Pinch with two fingers while Pan is active, or use Ctrl/⌘ + scroll over the video to zoom around the pointer. Ordinary scrolling reaches the workspace from the introduction and stops there on desktop; Ctrl/⌘ + scroll remains dedicated to video zoom. **Fit** restores 1× and centers that clip. Loading a replacement clip resets only its own view.

The video, pose overlay, and manual drawings share one transformed image plane, so drawing and editing work at any magnification. Exported PNGs show the current zoomed crop (including pan and mirroring); PDF reports include the zoomed view and state its magnification. This is display magnification, not an increase in the source video's resolution. Session views are not retained after a page reload.

`deploy/viewport.js` contains bounded view geometry, controls, and mouse/touch interactions. Tests verify playback persistence, independent comparison views, pointer-anchored zoom, pan bounds, frame stepping, resizing, mirror/drawing alignment, touch gestures, and image export.

Removing or replacing a clip with drawings, moments or analysis asks before clearing its work. Cancel keeps the current clip and its state. This protects against accidental changes; it does not save a session across page reloads. **View results** focuses completed analysis in the sidebar, and the **Results** section explains how to begin when no analysis exists.

## Visual key moments

After **Analyze**, seven visual previews appear alongside the player: Address, Backswing, Top of backswing, Downswing, Impact, Follow-through and Finish. Portrait videos use a tall player beside a four-column, two-row gallery on wide desktops. Landscape videos use a filmstrip below the player; comparison pairs A/B images for each moment. Phones place the gallery after playback controls, followed by the expanded sidebar sections.

Click an image to jump that player to its frame. **Enlarge & edit** (or a card heading) opens a large single/paired view with frame numbers, real-time timestamps, available angles, previous/next frame, Set from player, Play from here and Draw on frame. Editing a frame saves a manual mark. Each preview has a neighboring Set A / Set B button. All seven moments are visible without a phase dropdown; Edit A / Edit B opens exact frame editing. The sidebar shows tempo and PDF export. User marks override suggestions until the next completed analysis. FPS changes preserve their original frames; a completed analysis resets them to its new results.

Phase suggestions use a confidence-gated, torso-relative rise/drop/rise of the hands, with bounded gaps and ordered frames. These are explicitly labeled **Estimate**, not verified ball contact or a trained golf-event detector. Short, static, occluded or incomplete swings get seven labeled **Range previews** instead. Analysis does not automatically set tempo from uncertain suggestions. Tightening the analysis range around one complete swing improves the chance of useful estimates.

`deploy/keyframes.js` contains pure selection/merge logic. `deploy/keyframe-views.js` decodes only the needed thumbnails using separate local video elements, so thumbnail preparation never seeks the main players or changes synchronization. Canvas caches are bounded and released on replacement. Views show the full frame with the current mirror, pose visibility and applicable drawings; the main player's zoom is preserved separately. PDF reports include one page per visual moment with source labels, an annotated frame and its own analysis. No video or image leaves the device.

Related controls stay close: Fit is beside each compact zoom slider, Undo/Redo follow the vertical drawing tools, and Sync on/off and Sync Videos precede common playback. On very short phones the range/playback group follows a minimum-height video area, so footage remains usable and every control is reachable by scrolling.


Automatic phase selection uses the original hand-path sequence (address, apex, descending hands, impact region, follow-through, finish), with local sequence validation. A visible wrist and torso can suffice; short tracking gaps are bridged only for phase selection. Long occlusions split the range into separate runs. Each complete swing is consumed before selecting another, and the swing nearest the analysis playhead is preferred. Timing limits use real seconds, preserving slow-motion calibration. Overlay measurements still require observed landmarks. These are estimates of swing phases, not ball-contact detection; static, partial or unclear footage receives clearly labeled range previews. Deterministic trajectories cover these cases; real pose inference is tested separately, and detection accuracy has not been benchmarked against a labeled golf dataset.

## Restored review tools

- Results shows both elbows, both knees, lead wrist, torso lean and shoulder/hip **line slopes**. Compare shows A, B and B−A. These are visible 2D image angles, not measured 3D body rotation. Frame observations compare measurements with address; enlarged moments include phase guidance.
- Toggle skeleton, joints, angle labels, head/lead-hand/trail-hand paths and grid separately for each video. H shows/hides pose overlays. Choose a whole-swing path or the recent 1.5 real seconds. The comparison reference overlay shows B’s current pose on A with adjustable opacity; align comparable camera views first.
- **Video area** selects the full image or either half of a split-screen recording, for display and analysis. Drawings retain source coordinates; each area's previous analysis is recovered when returning to it. **Detailed** uses the Heavy pose model and source File FPS, up to 2,400 samples; Fast uses the lightweight model, up to 240 samples. Detailed takes longer.
- Each paired moment has **Sync here** for event alignment. Colored timeline marks jump to detected or edited phases; `[` / `]` move between them. `1` / `2` select comparison videos. Reset all edits in the frame editor restores estimates and offers Undo reset.
- **Loop window**, beside playback, captures the current analysis interval and repeats it during playback. Independently loop either video, or use Sync on to loop their overlapping calibrated intervals. Toggle Loop window off to stop looping; the green analysis window always follows playback.
- **Box** and **Label** join the drawing rail. Select a drawing, then use the nearby **Edit drawing** button for text, rotation and size. Color accepts custom values and stroke width supports 1–8 px. Optional copying of new drawings creates independently editable counterparts in the other video. Existing undo/redo and explicit copy remain.
- Every keyframe card shows its phase-specific results automatically, with separate A/B values in comparison. The **Analysis** button (chart icon on compact cards), immediately beside **Set here** or **Set A/B**, toggles that frame’s complete report in the gallery: plain-language strengths when supported, things to check and a practical next step, followed by all eight measurements and changes from address. Each video’s report opens independently. Players stay fixed while desktop reports scroll within the gallery; phone reports expand below the frame. Press Escape while reading a report to close it. **Results** still opens the enlarged frame and full analysis. Overlay affects only preview overlays; quick measurements remain visible when the full report is closed. Editing a marker or changing handedness refreshes that frame's results. On short laptops, comparison cards show frame numbers (hover for the full timestamp), and compact Zoom − / value / + / Fit controls preserve video height. PDF reports print all available moments with the same complete frame analysis.
