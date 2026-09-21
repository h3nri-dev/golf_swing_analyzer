# Swing Studio UX review — 21 September 2026

## Method and limits

Reviewed the production version at commit `4c826ea`, performed a task walkthrough in Chrome with local synthetic videos, and compared the interaction design with primary UX and accessibility guidance. This is a heuristic review and task-based software validation, **not a study with golfers**. The changes below are design hypotheses backed by those sources and the observed interface. Automated checks establish behavior and layout, not user satisfaction or full WCAG conformance.

The user's requirements remain constraints: two modes, local processing, persistent zoom, drawing beside the video, independent playback, selectable analysis ranges, a screen-sized desktop workspace with scroll snapping, and all five control sections permanently expanded in the right column.

## Tasks used to judge the interface

1. Open one clip, pause it, draw a reference line, undo it, and save the annotated image.
2. Load a reference clip, position each at impact, align them, and play them together.
3. Turn synchronization off, play only B, and step A without disturbing B.
4. Select a short section of B, analyze it, and find its results.
5. Use all five expanded sections while retaining playback, zoom and access to the video, using a keyboard or a small touchscreen.
6. Cancel an accidental removal or replacement without losing the current work.

## Findings and changes

| Observed problem | Consequence | Applied change |
| --- | --- | --- |
| The linked comparison displayed a shared Play control and a Play both button under each video. | Three buttons appear to have different purposes although they do the same thing. | The subsequent user request requires all three controllers to remain visible in comparison. Each local player now affects only its own clip, while the bottom player explicitly affects both. Local playback releases sync; common controls respect its current state. Distinct labels and behavior make the scopes explicit. |
| Align marks was disabled until points were marked in the Video panel. | The entry point gives no way to discover or satisfy its prerequisites. | Sync off exposes independent positioning. The adjacent Sync Videos button pauses and synchronizes the two visible frames in one click, confirms the offset, and turns Sync on. These actions stay together before the common timeline. |
| Tabs required switching between controls used together during review. | Draw, Video, Range, Results and Moments could not be inspected together. | All five are now permanently expanded in the right sidebar, following direct user feedback. Compact cards share two columns on wider screens. The Editing A/B selector states the common target. A persistent Help entry focuses each task without hiding other sections. |
| Pose showed unexplained dashes before analysis. Analyze range did not identify which comparison clip would be scanned. | Users must infer missing prerequisites and remember the active target. | The section is named Results, with an explicit empty state. Analyze A/B identifies the target; the desktop range shortcut shows the exact interval. Finished analysis exposes View results. |
| Tab and close actions hid controls and changed the available video area. | Users had to reopen tools and recover context repeatedly. | Removed the tablist and close behavior. Named sections remain visible and use ordinary Tab navigation; Help and View results focus the relevant section. The sidebar can scroll internally on short screens without moving the players. |
| The mobile panel could cover the video. | Settings obstructed drawing and playback. | At 900 CSS pixels wide or less, all expanded sections stack below the players. They never overlay the footage; proximity snapping permits scrolling through the controls. |
| Removing or replacing an annotated clip immediately cleared its session work. | A mistaken action loses drawings, moments and analysis. | A native confirmation identifies the affected clip and consequences, with Keep current video focused by default. Clips without session work do not require confirmation. |
| Frame rate was buried in the selected clip's sidebar, and slow-motion exports shared an uncorrected media clock. | Users could not inspect both rates together; normal and slow-motion swings drifted after alignment. | Each player now shows File FPS and Shot FPS beside playback. Same is the default recording rate for ordinary footage. Slow-motion settings map playback, seeking, alignment and stepping to real time; the visible Video help explains both fields. Compact landscape controls preserve room for the footage. |
| With Sync off, playing one video changed the common Play button to Pause and moved its timeline and speed display. | The common controller appeared to be activated by a local action; pressing it could pause the playing clip instead of starting both. | The common controller now keeps its last group state during independent use. Local playback, seeking, speed changes, selection and clip completion leave it unchanged. Explicit common commands resume updates and operate on both; Play both starts both even if one is already playing. |

## Moment and report follow-up

The user asked for moment access directly after Play A / Play B, frame-aware time displays, and a PDF for nontechnical users. Per-player Moments menus now support direct jumps and an adjacent frame editor with Set here and deletion; the same menu sits beside Play in single mode. Native selects and dialogs retain keyboard behavior. On small phones the menu uses a flag icon to preserve room for the video.

All displayed times and range inputs use real elapsed seconds derived from the file/recording FPS, with frame numbers counted from 0. Internal timestamps preserve the original media coordinates. Reports replace the JSON download with a comparison overview and a key-moment page per swing, including annotated frames, calibration, ranges, coverage, tempo and available 2D measurements. Export works before analysis, labels missing data, can be canceled, and restores the original views. PDF pages were rendered and visually inspected for clipping, spacing and readable captions, including non-Latin filenames.

## Research basis

- **Prioritize common actions and make secondary controls discoverable.** [NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) supports deferring infrequent options while keeping frequently combined actions together. Playback, seeking, zoom, drawing tools and synchronization remain in the working view. The later user request supersedes the earlier tab-based disclosure: settings and results are now grouped in expanded cards beside the footage.
- **Show state and provide recovery.** [NN/g, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) informed the selected-swing badges, alignment feedback, meaningful empty states, consistent exits and protection against losing session work.
- **Keep keyboard focus predictable.** The earlier tab implementation followed the W3C APG Tabs Pattern; removing tabs also removes their special arrow-key behavior. Expanded sections now use ordinary Tab order and explicit headings. Task shortcuts focus the relevant section. Native dialogs handle focus containment and Escape for Help and discard confirmation.
- **Make targets easier to activate.** [W3C, Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) describes a 24 CSS pixel minimum, with exceptions, and recommends larger targets where possible. Primary controls generally use 36–44 pixel heights; compact layouts preserve at least 28 pixels for tool icons. Removal buttons and timelines were enlarged. This is not a claim that every WCAG criterion has been audited.
- **Match the sports-video mental model.** [Kinovea, Comparison and synchronization](https://www.kinovea.org/help/en/observation/comparison.html) documents independent timelines and synchronizing the currently visible frames at a shared event. This supports the revised impact-alignment workflow and explicit separation of joint and individual playback.
- **Separate recording rate from playback rate.** [Kinovea, Time calibration](https://www.kinovea.org/help/en/measurement/time.html) distinguishes capture FPS from a slow-motion file's encoded rate. The user confirmed both ordinary different-FPS and slow-motion comparisons. Both rates are now visible together for each clip, with Same avoiding unnecessary configuration for ordinary footage. [HTML media time](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/currentTime) remains the basis for stored timestamps; playback correction and tempo durations use a separate real-time conversion.

## Validation and next research

Regression tests cover drawing, export, range selection, real local pose inference, zoom and independent playback. Task checks additionally cover alignment without hidden prerequisites, the number and scope of visible playback controls, selected analysis target, result discovery, keyboard focus, native dialog cancellation, and mobile comparison controls. Layout checks use 1440×900, 1280×720, 2560×1440, 390×844, 320×568 and 844×390 viewports, including actual drawings and marked-frame menus. Sidebar checks require all five sections to stay expanded, no tablist, no horizontal overflow, and no sidebar scrolling at 1440×900 and larger desktop test sizes. Shorter desktop screens may use internal sidebar scrolling; phone sections follow the players.

Timing checks use generated 30/60 FPS files and a 120 FPS source slowed to a 30 FPS file. They exercise shared stepping, playback drift, speed changes, seek/restart/end limits, independent playback, preserved marks, real-time tempo durations, exports and clip replacement. Pure timing tests cover fractional rates, both offset directions, unequal durations and repeated steps without accumulated offset drift. Future user observation should also test whether golfers can correctly identify File FPS versus Shot FPS from their own phone exports.

Before claiming improved usability in practice, observe golfers using their own clips. A useful next round would include five participants across desktop and phone, ask them to complete tasks 1–4 without coaching, and record completion, wrong-clip actions, requests for help and where they hesitate. In particular, test whether Sync off for positioning and Sync Videos for alignment communicate their distinct purposes and whether users discover the drawing settings. Revise labels and placement based on those observations; do not infer success from page visits or automated test results.

## Restore visual key moments

The original site at commit `8cc316e` displayed a six-card keyframe grid with pose overlays. The studio redesign removed that visual result and left only markers and measurements. The user's follow-up identified this as a regression: completing analysis must immediately reveal recognizable video frames.

The restored gallery stays visible alongside/below the players, without a results tab. A wide desktop with a portrait video uses a tall player and a 2×3 grid; landscape video uses a filmstrip; comparison groups matching A/B previews. An enlarged native dialog supports large images, available measurements, frame correction and adjacent play/draw actions. Returning to the player preserves its zoom. Thumbnail decoders are separate from the main videos, and preview clicks use individual playback semantics, preserving the shared-controller state when Sync is off.

This follows [Kinovea's key-image panel](https://kinovea.readthedocs.io/en/latest/annotation/key_image_management.html), which displays selected frames next to the review workflow, and [NN/g's recognition-over-recall guidance](https://www.nngroup.com/articles/recognition-and-recall/): show the actual visual content instead of requiring a golfer to remember a timestamp or search a menu. These sources inform the design; automated checks do not establish usability gains in a golfer study.

Phase estimates and user-confirmed marks have distinct labels. If the hand path lacks a sufficiently clear swing progression, the six sampled frames are called Range previews, with a short explanation and editing access. Manual marks remain authoritative during reanalysis. The restored previews, including range fallbacks and optional downswing/follow-through marks, are included in PDF reports.

Validation covers six-frame generation, occlusion/static/partial-range fallbacks, frame bounds, manual precedence, cancellation, slow-motion frame editing, A/B previews, independent playback, PDF inclusion, drawing/visibility updates, and desktop/phone layout. Real MediaPipe inference is checked separately from deterministic trajectory tests; neither is a measured golf-event accuracy benchmark.
