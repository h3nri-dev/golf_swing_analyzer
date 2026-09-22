# Original-to-redesign feature audit

Reviewed against **`8cc316e`**, the last original production implementation before the redesign, and **`60c8a13`**, the redesign at the start of this review. The original consists of `deploy/index.html` and `deploy/app.1773037933.js`. I inspected the HTML controls and their actual JavaScript handlers, not just screenshots or unused state fields.

The redesign had lost useful review capabilities. A cleaner layout did not justify those losses. This change restores the omissions below and makes feature parity a documented requirement for future changes.

## Restored in this change

| Original capability and evidence | Gap at review start | Current implementation |
| --- | --- | --- |
| Seven phases in the `c` array and `.kf-marker` buttons: Address, Backswing, Apex, Downswing, Impact, Follow Thru, Finish | Backswing was missing; six phases remained | Seven consistent, colored phases in detection, visible cards, frame editor, navigation and PDF. Apex is called Top. The original displayed six preview cards (`Xt=[0,2,3,4,5,6]`); all seven now have previews. |
| Eight measurements in `d`, `Ut`, and `Dt` | Only lead elbow, lead knee and torso lean remained | Both elbows, both knees, torso lean, lead wrist, shoulder line and hip line. Image aspect ratio and confidence are respected. Shoulder/hip **line slopes** replace misleading 3D turn claims. |
| Current-frame and per-keyframe feedback (`Rt`, `ee`, `ne`) | No posture observations or phase guidance | Always-visible phase-specific results on every card, paired A/B values, and a nearby Results action for all eight measurements, signed changes from address and phase guidance alongside the enlarged frame. Each PDF frame page uses that same analysis and prints every finding. Missing tracking/baselines stay unavailable; an unset address is never treated as frame zero. |
| Head, lead-hand and trail-hand paths (`Tt`, trajectory toggles in `Yt`) | Only a short lead-hand path | Three independently selectable colored paths; whole analyzed swing up to the playhead or recent 1.5 real seconds. Paths break across missing observations. |
| Skeleton, angles, joints, annotations and master auto-overlay toggle (`Yt`, `St`, `.panel-overlay-btn`) | Fewer independent overlay options | Per-video skeleton, joints, angle labels, grid, all pose overlays, overlay size, and separate drawing visibility. Thumbnail Overlay remains independently available. |
| Comparison angle grid (`Kt`, `angleCompareGrid`) | No side-by-side measurement differences | Both videos' values and signed B−A differences for all eight measurements. No arbitrary good/bad grade on a difference. |
| Ghost B skeleton on A (`ghostToggle`, `ghostOpacitySlider`, `Pt`) | Missing | Reference-pose overlay with opacity. Uses current independently controlled playheads; honors crop and mirror. |
| Split-screen crop (`panel-crop-select`, `dt`, model input cropping) | Missing | Full frame, left half, right half for both viewing and inference. Drawings and poses share original source coordinates. Switching areas caches each area's analysis rather than throwing it away. |
| Heavy pose model (`modelComplexity:2`) and scanning source frames (`_t`) | Only lightweight model and capped quick scan | Fast and Detailed choices. Detailed uses MediaPipe Heavy and File FPS, bounded at 2,400 samples. Fast retains its 240-sample cap. Both are local and cancellable. |
| Phase alignment (`btnAlignPhase`, `alignPhaseSelect`) | Only alignment of current playheads | Each paired moment has **Sync here** beside its frames. Aligns the selected event using File FPS/Shot FPS calibration. Sync Videos still aligns current playheads beside the common controls. |
| Range looping (original time-update handler checks `trimStart`/`trimEnd`) | Selected range affected analysis only | Explicit **Loop window** beside playback captures fixed boundaries. Independent loops leave the other player/common display alone; linked loops use the overlapping calibrated intervals. Toggle the button to exit. The green analysis window keeps following playback separately. |
| Colored timeline phase pips (`Vt`), active moment and phase keyboard jumps | Missing | Colored, clickable timeline marks, highlighted current moment, `[` / `]` phase jumps. Sampled range previews are not presented as detected phase marks. |
| Rectangle, label pin, custom color, size and rotation (`draw-tool-btn`, drawing pointer handlers) | Rectangle/label/rotation/scaling/custom color missing | Box and Label in the vertical rail, custom color, editable text, rotation and scaling beside the selected drawing. Existing pen/line/arrow/circle/angle/selection remain. |
| Mirror new drawings (`mirrorDrawings`, `.panel-mirror-btn`) | Only explicit copy remained | Optional **Copy new drawings to other video**, plus explicit copy. Copies are independently editable, with their own undo histories. Copying does not reverse the image. |
| Reset edited keyframes (`kfResetBtn`, `originalKeyframes`) | Only individual reset | Reset all edits with Undo reset, plus individual reset to estimates. Per the subsequent user request, a completed new analysis replaces prior markers; cancellation or failure preserves them. |
| 0.1× playback (`speedSelect`), keyboard tool shortcuts and Help | Some omitted | 0.1× restored locally and commonly; V/M/F/L/A/C/R/D, H, 1/2, phase navigation and existing playback/undo shortcuts documented in Help. |
| Feedback contact (`feedbackBtn` handler) | Missing | Original email address linked from Help. No automatic email or clipboard writes. |

## Preserved or replaced with a direct equivalent

- **Automatic keyframe detection was already restored before this audit.** It remains a core result of Analyze. This change adds the missing backswing moment; it does not claim a newly trained or clinically validated golf model. The detector uses wrist motion and ordered swing events, tolerates brief occlusion, and chooses a nearby complete swing. Uncertain footage produces clearly labelled range previews.
- **Single/compare, independent players and common controls:** retained, along with FPS-aware timing, slow-motion calibration, persistent zoom/pan, mirror, large-screen layout, a ±5-real-second analysis highlight merged into the tall playback scrubber. The subsequent user request replaces separate exact-boundary inputs and pinning with an always-following selection.
- **Numeric synchronization offset:** represented by frame editing/stepping and Sync Videos, or Sync here on a moment. These give exact event alignment without a separate offset field far from the playback controls.
- **Trim timeline magnification:** restored as automatic expansion of the playback timeline to the completed analysis window, with Analyzed range / Full video controls immediately beside it. Numbered phase labels stay selectable with connectors to their precise timestamps. The playback scrubber now owns its following green analysis window; Full video restores the clip overview to select another section. Spatial video zoom is separate. Looping remains explicit.
- **Reset session:** the original reset handler unloaded the clip and erased its analysis/drawings. The redesigned Remove/Replace actions provide that function, with confirmation when work exists. It was not a separate “clear only analysis” feature.
- **Tempo:** ratio and actual backswing/downswing durations remain. Automatic estimates and manual marks are distinguished. The old universal “good tempo” bands are not treated as a diagnosis.
- **Manual annotation undo/redo, movement, visibility, frame scope, deletion and clearing:** retained, with larger pointer targets and touch input. PNG exports and printable PDF reports keep visible annotations; JSON is not the user export format.
- **Mobile carousel:** replaced by a visible responsive gallery plus enlarged frame viewer and phase navigation. No cards require a hidden sidebar tab.
- **Analytics usage events:** restored `video_loaded` and `analysis_complete` counts, gated by consent and tag readiness. No filename, video, drawing, measurement or score is sent. Pre-consent activity is not replayed. The original custom engagement timer/session-end event is replaced by Google Analytics’ standard engagement handling rather than a second page-lifetime timer.
- **Analytics, privacy and terms:** the original GA property `G-MG3PW4FRFM`, privacy policy, terms and cookie settings were already restored. Consent remains required before loading GA. The feedback address and original brand domain are retained.

## Original code that should not be represented as a working feature

1. **Randomized swing score:** `$t` added `3 * (Math.random() - 0.5)` and chose random praise phrases. Restoring that as an objective assessment would be misleading. Measurements and explicit observations replace it.
2. **Ball/club tracking:** the bundle contained sports-ball detection attempts, club-edge heuristics and synthetic ball-flight extrapolation after impact. The actual trajectory renderer `Tt` and reachable toggles rendered only head and both hands. Seed-marking/backend remnants had no usable controls in this deployed HTML. These are not restored as claims of reliable clubhead speed, ball flight or launch measurement. Manual drawings remain available to inspect these visually.
3. **Club-line-width slider:** the original handler changed `clubLineWidth`, but the production trajectory rendering path did not use it. An inert control is not useful parity.
4. **Uncalibrated turn/clubface/power prescriptions:** a 2D image does not establish arbitrary 3D body rotation, clubface angle or ball outcome. Shoulder/hip slopes and measured changes are explicitly labelled as image observations.
5. **Source-inspection blocking, domain blocking and placeholder ads:** these do not improve swing review and are intentionally excluded. The production domain and actual consent/legal features remain.

## Evidence and design basis

- [Original source tree at 8cc316e](https://github.com/h3nri-dev/golf_swing_analyzer/tree/8cc316e/deploy). Function names above refer to this bundle; they are stable evidence even though it is minified.
- [Google's Pose Landmarker documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) distinguishes image landmarks, world landmarks and Lite/Full/Heavy models. This app's measurements use visible image geometry, not inferred physical rotation.
- [Kinovea: angle measurement](https://www.kinovea.org/help/en/measurement/angle.html) explains the limitation of reading arbitrary 3D angles from an image.
- [Kinovea: comparison](https://www.kinovea.org/help/en/observation/comparison.html) grounds synchronization in a shared event. Here the event's paired frames own the synchronization action.
- The user's proximity rule governs placement: marking/jumping/syncing on moment cards; drawing tools at the video; transforms at the selected drawing; looping at the range; analysis range within the playback scrubber, Analyze directly after Speed; global synchronization beside global playback.

## Validation and limits

Automated checks cover seven ordered moments, confidence/aspect/handedness, crop coordinate mapping, missing observations, path gaps, rotated drawing selection, per-video overlays and crop-result preservation, drawing copies, phase alignment with slow motion, loop isolation, responsive geometry and PDF export. Existing analysis, consent, range, zoom, independent transport and mode wording regressions remain in the suite.

Desktop and phone screenshots and the exported PDF are inspected, not just generated. Real MediaPipe inference is checked separately from deterministic mocked-pose tests. A synthetic/person fixture is not a ground-truth golf accuracy benchmark. Phase estimates, especially impact, still require visual review. Variable-rate slow-motion ramps need per-segment treatment; constant File FPS/Shot FPS calibration cannot undo arbitrary ramps. Detailed scanning is bounded to avoid unbounded device work.

Completed verification: 45 unit tests passed. Browser coverage includes real inference with both Lite and Heavy models, seven moments, independent transport, crop-result preservation, drawing transforms, consent and responsive layouts. The final seven-test rerun passed for PDFs, crop caching, Detailed analysis and loop boundaries. Screenshots were inspected at 1280, 1440 and 2560 desktop widths and phone sizes. All 14 pages from analyzed single (4), analyzed comparison (7) and annotated comparison (3) PDF examples were rendered and inspected; cropped/mirrored PNG export was also compared with the live view. JavaScript syntax and whitespace checks passed.
