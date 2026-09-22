# FreeGolfSwingAnalyzer.com UX review — 21 September 2026

## Method and limits

Reviewed the production version at commit `4c826ea`, performed a task walkthrough in Chrome with local synthetic videos, and compared the interaction design with primary UX and accessibility guidance. This is a heuristic review and task-based software validation, **not a study with golfers**. The changes below are design hypotheses backed by those sources and the observed interface. Automated checks establish behavior and layout, not user satisfaction or full WCAG conformance.

The user's requirements remain constraints: two modes, local processing, persistent zoom, drawing beside the video, independent playback, selectable analysis ranges, a screen-sized desktop workspace with scroll snapping, and all control sections permanently expanded. The latest user request places Range immediately above playback; the other four remain in the right column.

The lower full-screen introduction/guide has moved into an About dialog. It previously created an unwanted scroll-snap destination beyond the players. The studio now ends the page on desktop, while privacy, terms and cookie settings share the existing status row. About and Help share the top of the existing inspector with Single/Compare on desktop; phones use a compact mode row. The separate desktop title row and upper introduction have also been removed. The same logo/domain sits in each video's lower corner without capturing pointer events or moving with zoom. On phones, the full domain remains readable and expanded controls follow a minimum-height video area; legal links follow the controls. This change preserves natural mobile scrolling instead of clipping controls or squeezing the footage to fit branding.

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
| Tabs required switching between controls used together during review. | Draw, Video, Range, Results and Moments could not be inspected together. | All five remain expanded; Range now sits above playback per the latest user request, with the other four in the right sidebar. Compact cards share two columns on wider screens. The Editing A/B selector states the common target. A persistent Help entry focuses each task without hiding other sections. |
| Pose showed unexplained dashes before analysis. Analyze range did not identify which comparison clip would be scanned. | Users must infer missing prerequisites and remember the active target. | The section is named Results, with an explicit empty state. Analyze A/B identifies the target; the adjacent range row shows the exact interval. Finished analysis exposes View results. |
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

Regression tests cover drawing, export, range selection, real local pose inference, zoom and independent playback. Task checks additionally cover alignment without hidden prerequisites, the number and scope of visible playback controls, selected analysis target, result discovery, keyboard focus, native dialog cancellation, and mobile comparison controls. Layout checks use 1440×900, 1280×720, 2560×1440, 390×844, 320×568 and 844×390 viewports, including actual drawings and marked-frame menus. Layout checks require all five sections to stay expanded, no tablist, no horizontal overflow, and no sidebar scrolling at 1440×900 and larger desktop test sizes. Shorter desktop screens may use internal sidebar scrolling; phone sections follow the players.

Timing checks use generated 30/60 FPS files and a 120 FPS source slowed to a 30 FPS file. They exercise shared stepping, playback drift, speed changes, seek/restart/end limits, independent playback, preserved marks, real-time tempo durations, exports and clip replacement. Pure timing tests cover fractional rates, both offset directions, unequal durations and repeated steps without accumulated offset drift. Future user observation should also test whether golfers can correctly identify File FPS versus Shot FPS from their own phone exports.

Before claiming improved usability in practice, observe golfers using their own clips. A useful next round would include five participants across desktop and phone, ask them to complete tasks 1–4 without coaching, and record completion, wrong-clip actions, requests for help and where they hesitate. In particular, test whether Sync off for positioning and Sync Videos for alignment communicate their distinct purposes and whether users discover the drawing settings. Revise labels and placement based on those observations; do not infer success from page visits or automated test results.

## Restore visual key moments

The original site at commit `8cc316e` displayed a six-card keyframe grid with pose overlays. The studio redesign removed that visual result and left only markers and measurements. The user's follow-up identified this as a regression: completing analysis must immediately reveal recognizable video frames.

The restored gallery stays visible alongside/below the players, without a results tab. A wide desktop with a portrait video uses a tall player and a 2×3 grid; landscape video uses a filmstrip; comparison groups matching A/B previews. An enlarged native dialog supports large images, available measurements, frame correction and adjacent play/draw actions. Returning to the player preserves its zoom. Thumbnail decoders are separate from the main videos, and preview clicks use individual playback semantics, preserving the shared-controller state when Sync is off.

This follows [Kinovea's key-image panel](https://kinovea.readthedocs.io/en/latest/annotation/key_image_management.html), which displays selected frames next to the review workflow, and [NN/g's recognition-over-recall guidance](https://www.nngroup.com/articles/recognition-and-recall/): show the actual visual content instead of requiring a golfer to remember a timestamp or search a menu. These sources inform the design; automated checks do not establish usability gains in a golfer study.

Phase estimates and user-confirmed marks have distinct labels. If the hand path lacks a sufficiently clear swing progression, the six sampled frames are called Range previews, with a short explanation and editing access. Manual marks remain authoritative during reanalysis. The restored previews, including range fallbacks and optional downswing/follow-through marks, are included in PDF reports.

Validation covers six-frame generation, occlusion/static/partial-range fallbacks, frame bounds, manual precedence, cancellation, slow-motion frame editing, A/B previews, independent playback, PDF inclusion, drawing/visibility updates, and desktop/phone layout. Real MediaPipe inference is checked separately from deterministic trajectory tests; neither is a measured golf-event accuracy benchmark.


## Proximity review: analysis range and playback

The range editor previously lived across the screen from the playback timeline and Analyze button. This violated the user’s repeated requirement to place related actions together. The editor is now a permanent row directly above the common player. Its A/B target, start/end fields, Set/Go actions, reset and Analyze/Cancel stay in that row. Selecting A or B reuses the existing editing target and preserves each clip’s own interval.

| Workflow | Review outcome |
| --- | --- |
| Select, preview and analyze a range | Range is directly above playback, with analysis and cancellation beside it; errors remain inline. |
| Synchronize or operate clips independently | Sync on/off and Sync Videos remain adjacent before common playback. Each player retains its timeline, clock, steps, moments, speed and restart. |
| Zoom and recover the full view | Fit moves beside the compact zoom slider; zoom persists while playing. |
| Draw, correct and export | Undo/Redo follow the vertical drawing tools instead of sitting at the bottom of the rail. Color, scope, copying and export remain expanded. |
| Review key moments and measurements | All six previews remain visible after analysis, with paired frames sharing a row to preserve video height. Enlarge/edit and PDF export remain available. |
| Resize and use a keyboard or touchscreen | Desktop controls use available width; laptop playback spans the workspace. At very small phone sizes controls stack below a minimum-height player. No control is covered or removed. |

Geometry regression checks protect range-before-player ordering, neighboring analysis commands, Fit/Zoom and drawing history placement, and adjacent sync/alignment controls. Range selection, real-time FPS conversions, independent controller state, analysis cancellation, drawings, previews and PDF export continue to use the established behavior tests. This is an implementation review and browser task check, not a new study with golfers.


## Default sliding analysis window

Selecting two small boundary handles was unnecessary work for the common task of reviewing the swing currently on screen. The default is now a visible ±5-real-second window following the playhead. Analyze captures the current window immediately, then freezes it while scanning. Each edge is clipped to the video duration, so the window is shorter near the beginning/end instead of scanning more than five seconds away.

One 48×40-pixel thumb moves the window as a unit. Dragging it pins the selection without seeking or pausing the video. A pressed-state Follow ±5s control next to the window distinguishes automatic from pinned selection and restores the default. Precise fields and Set/Go controls remain available, and automatically pin the range. Native range input semantics support touch and keyboard; arrows move one second, Shift + arrow one recorded frame, and Page Up/Down five seconds. A and B retain separate settings.

Validation uses a generated 60-second clip to test centered scans, the actual playhead at Analyze click, edge clipping, sliding and exact edits, cancellation, touch/keyboard access, independent playback, zoom preservation and slow-motion conversion. No source video is uploaded and no backend is added.

## Automatic detection and direct moment cards

The user's latest review identified two real regressions: the partial replacement detector rejected whole ranges after short tracking failures, and only manual marks fed the exact-frame editor/tempo. Marker creation was across the screen; the dropdown hid phase choices and duplicated the visual gallery. The earlier menu workflow above is superseded.

Reviewed the original `8cc316e` detector: address from hand stillness, apex from wrist height, impact from low hands/high speed, follow-through from the next high wrist position, plus intermediate phases. The current algorithm restores the automatic sequence while evaluating continuous local runs, accepting a visible wrist, bridging at most two brief missed samples, separating complete swings and calibrating duration limits for slow motion. It selects a nearby complete swing instead of joining two swings. Auto estimates now populate exact-frame editing, tempo and PDF measurements; manual corrections override them. Uncertain sampled frames remain explicitly labeled and never become tempo inputs.

The final design has **one set of six visible moment cards**. Each phase owns the preview/jump target, calibrated timestamp and neighboring Set A/Set B actions. Edit A/B and enlargement are in the same gallery header. Removing the sidebar shortcuts and dropdown prevents cross-screen trips; combining marker actions with the existing previews avoids duplicate control rows that squeeze the video. FPS and compact zoom share a local view-settings group; playback stays between that group and the moment gallery. The inspector retains drawing, video options, measurements, tempo and report export.

This applies [NN/g recognition over recall](https://www.nngroup.com/articles/recognition-and-recall/) and [Kinovea key-image management](https://kinovea.readthedocs.io/en/latest/annotation/key_image_management.html): keep visual events and their actions visible in the review workflow. Phase colors are accompanied by names, numbers and source labels in accordance with [W3C use-of-color guidance](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html). Green address, purple top, amber downswing, red impact, teal follow-through and pink finish match across preview cards, editing and PDF accents. Range previews use neutral accents.

Project instructions now explicitly preserve these requirements (`AGENTS.md` and `CLAUDE.md`). Regression coverage includes automatic detection with occluded lead-in/tails, one hidden wrist, brief pose gaps, multiple swings, slow motion, manual override/reset, source labels, local marking/jumps, common-controller isolation, keyboard access, target geometry and video height. Deterministic trajectories and a separate real-inference smoke test do not establish golf-phase accuracy on a labeled real-world dataset; no user-study result is claimed.

Final validation: 38 unit tests and 98 Chrome browser tests passed, including actual MediaPipe inference. Single/paired PDFs were rendered and all six test-report pages visually checked. Screenshots cover 1280×720, 1440×900, 2560×1440 and phone layouts; zoom controls are bounded as a group so buttons cannot drift apart on wide screens.


## Original-feature parity review (September 2026)

The complete source comparison is in [ORIGINAL_FEATURE_AUDIT.md](ORIGINAL_FEATURE_AUDIT.md). It supersedes the earlier six-phase inventory: the original had seven phase markers but only six preview cards. The missing backswing now has a seventh card and all equivalent editing/export/navigation actions.

Restoration covers measurements, observations, paths/overlays, reference pose, crop, detailed scanning, phase alignment, range looping and drawing capabilities. The right column uses two short measurement tables and expanded task groups; at laptop desktop widths it extends beside the playback dock so tools fit without reducing text to force a fit. Drawing transformations open beside the selected drawing. Neither range nor global synchronization moves away from playback. Overlay/Notes controls sit with the preview images they affect.

This is a source audit and browser task review, not a claim of a new golfer usability study. Random grading and unobserved ball flight are explicitly replaced, with evidence in the audit. Future redesigns must retain an inventory of capabilities and regression coverage before changing their layout.

Verification for this restoration: 45 unit tests passed; browser checks covered both actual Lite and Heavy pose inference, analyzed single/compare layouts, independent controls, overlay/crop persistence, consent, drawing transforms and exports. The final targeted PDF/crop/loop rerun passed all seven tests. Desktop and phone screenshots were inspected, along with all 14 rendered pages from three PDF examples and a cropped/mirrored PNG. At ordinary 1440×900 and larger desktop sizes the expanded sidebar fits; short/narrow screens allow internal sidebar scrolling while keeping the workspace and playback dock together.

## Portrait gallery density

The portrait gallery now uses four columns and two rows on desktop, replacing the two-column, four-row layout that left large empty areas beside narrow video frames. The seven moments fill the first four and next three cells; Finish has the same width as the other cards. More of the review area is allocated to the gallery while retaining the tall player and nearby controls. Text sizes, full-frame aspect ratios and moment actions are preserved. Checked the grid and equal card widths at 1180, 1280, 1440, 1920 and 2560 pixels; key-moment and proximity browser checks passed on desktop and phone layouts.

## Reviewing a short analyzed interval

The full-clip playback scale clustered swing events into a few pixels on long recordings. Completing analysis now expands the timeline to that saved interval. Analyzed range / Full video controls, interval endpoints and magnification live beside the timeline. Markers retain phase colors and numbers; crowded labels spread apart with connectors to exact timestamp anchors. Scope changes do not seek or change spatial zoom. Playback and the following selection for the next analysis cannot move the review viewport; cancellation preserves it.

Individual timelines retain separate view states and single-video marker actions. Common marker actions preserve sync when enabled and use calibrated real-time changes for independent normal/slow-motion clips. Short desktop layouts use full-width local scrubbers, compact non-overlapping dots and adjacent scope toggles; the common controller keeps numbered markers. The workspace gives more width to the players on short screens, with internal inspector scrolling instead of collapsing video height. All key-moment cards and playback controls remain available.

Validation includes 47 unit tests and 51 browser regressions covering window selection, cancellation, markers, FPS calibration, independent/common controls, keyframe views, drawings and responsive layouts. Screenshots were inspected for single and comparison review at laptop, desktop and phone sizes. Focused checks additionally verify compact marker click targets do not overlap and scope toggles preserve playheads and synchronization.


## Full-frame PDF and title-free workspace follow-up

The workspace now starts at the top of the screen. The former full-width brand/title row has moved into the existing right inspector, with Single/Compare, About and Help still visible. Drawing target selection sits in Draw; all local/common playback, range and marking controls retain their established neighbors. The first-visit analytics choice occupies the lower dock and disappears after a choice; it never covers footage or creates another scrolling screen. Product labels use FreeGolfSwingAnalyzer.com throughout the app, legal pages and image/PDF exports.

PDF export now gives each current view and each available moment its own page, with a large aspect-correct image, visible domain watermark, frame-specific measurements and observations, calibrated time/FPS, range and tempo. Portrait/landscape page orientation follows the captured view. Empty player margins are trimmed while visible crop, mirror, pan and zoom are preserved. Both current views are captured before seeking either clip to its moments, retaining the original reference overlay. Seven analyzed moments produce eight pages per video; an unmarked, unanalyzed clip produces one page. Manual-only exports include just the marked moments, without blank placeholders.

Validation includes one drawn video image per PDF page, portrait/landscape proportions, Unicode filenames, watermark and statistics on each page, restored playheads/drawings/views, retry/cancel, consent, mode labels, independent playback and responsive geometry. Rendered PDF examples cover untracked, manual, automatically estimated and sampled frames, including cropped/mirrored drawings. Desktop workspace tests assert that videos start at the top and document height does not exceed the viewport.

Completed checks for this follow-up: 47 unit tests and 77 distinct Chrome browser tests passed. All 39 pages across six exported examples were rendered and reviewed, including portrait/landscape, manual/automatic/sampled frames, Unicode filenames, and a cropped/mirrored annotated frame.
