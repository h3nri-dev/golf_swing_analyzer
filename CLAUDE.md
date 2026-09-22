# Golf Swing Analyzer / Swing Studio

Repository: `h3nri-dev/golf_swing_analyzer`. Existing production host: Cloudflare Pages project `freegolfswinganalyzer`, serving `deploy/` at `freegolfswinganalyzer.com`.

This is a build-free, browser-only application. Keep production entirely static: no backend, secret, database or video upload. Preserve the original Google Analytics property G-MG3PW4FRFM, gated by explicit opt-in in `consent.js`, along with the privacy policy, terms and persistent cookie-settings links. The Google tag must not load before consent; all advertising features remain off. The separate hosting-injected Cloudflare beacon is disclosed in the privacy policy. Do not add a server runtime to support analysis. Node dependencies are development/testing/deployment tools only.

## Files

- `deploy/index.html`, `styles.css`: semantic responsive interface.
- `deploy/consent.js`, `consent.css`, `privacy.html`, `terms.html`, `legal.css`: optional analytics consent and full policies. Preserve the original `golf_cookie_consent` preference, stop GA collection and clear accessible GA cookies on withdrawal, and propagate changes across tabs without losing a video session. Legal links must remain visible in the footer and available in workspace Help. Never remove these during a UI rewrite; protect consent behavior with `tests/consent.spec.js`.
- `deploy/screen.js`, `deploy/screen.css`, `deploy/sidebar.css`, `deploy/review-layout.css`: viewport-sized studio, permanent expanded right sidebar and native scroll snapping. Draw, Video, Results and Tempo & report remain expanded in the right sidebar without tabs. Moment creation and navigation belong on the visible keyframe cards immediately beside/below the players, never in the sidebar. Range belongs immediately above the common player, with its A/B selector and Analyze/Cancel together. Keep normal desktop controls within the viewport; allow internal sidebar scrolling on short/narrow desktop screens or at high text zoom. On phones, stack the expanded sections below the players without covering them.
- `deploy/ux.js`, `deploy/ux.css`: task help, session-work confirmation and interaction refinements. `UX_REVIEW.md` records the research basis and task checks.
- Keep the studio as the final page section: the former full-screen lower guide belongs in the About dialog, accessible from the logo/domain beside Single/Compare and from Help. Desktop downward scrolling must stop at the video workspace. Keep privacy, terms and cookie links in the existing desktop status row (after mobile controls on phones), not in a separate scrolling destination. Preserve the readable logo/domain in each video’s lower corner, outside the zoom/mirror layer and without intercepting drawing gestures.
- `deploy/app.js`: two local video slots, single/compare modes, playback synchronization, lazy MediaPipe inference and export.
- Compare mode must keep both individual players and the common controller visible. Individual playback actions affect one clip and release sync; common actions affect both, respecting the current sync state. Keep zoom sliders compact.
- With Sync off, individual playback must not change the common controller's displayed play state, timeline, clock or speed. Preserve its last group state until another common command; Play both must start both even when one is already playing independently. Keep regression coverage for both controller scopes.
- Group related controls together to minimize mouse travel. Keep Sync on/off and Sync Videos next to each other immediately before the common playback controls, below the videos. Keep analysis range immediately above playback, Fit beside Zoom, and Undo/Redo directly after the drawing tools. Never relocate these related actions to distant sections. Protect their geometry with browser regression tests and apply this proximity principle to future interface changes.
- Keep File FPS and Shot FPS visible on each player. `deploy/timing.js` maps file seconds to a shared real-time clock: normal different-FPS clips retain equal playback speed; constant slow-motion footage uses recording FPS / file FPS. Shared steps use the lower recording FPS. Preserve file-time marks, pinned ranges and drawings when retiming, and test both normal and slow-motion comparisons.
- `deploy/moments.js`: seven visible, color-coded moment cards with adjacent Set A/Set B buttons; no phase dropdowns or distant marking controls; frame editing and jumps must remain local when Sync is off. Display clocks, markers and ranges in real seconds and label zero-based frame numbers.
- `deploy/report.js`, `deploy/vendor/`: browser-only PDF export. Keep reports readable, include annotated frames and timing, preserve playheads and views, and visually render-check the output. No user-facing JSON download.
- `deploy/range.js`: default to a sliding window of ±5 real seconds around the playhead, clipped at the video edges. Refresh at Analyze click, then freeze during analysis/export. Dragging or exact edits pin a per-clip range; Follow ±5s restores automatic selection. Window movement must not seek or pause playback, and pinned ranges retain their file frames when retiming. Keep the broad window control above playback.
- `deploy/analysis.js`: pure calculation helpers; unit-test changes here.
- `deploy/timeline.js`, `navigation.js`, `timeline.css`: automatically expand playback timelines to the completed analysis interval, with adjacent Analyzed range / Full video controls and non-overlapping numbered moment labels connected to exact frame anchors. Save bounds in file seconds; display calibrated real seconds. The live analysis selector cannot move the review viewport. Preserve cancellation, per-player view scopes and common-controller isolation when Sync is off. Timeline magnification must not change spatial video zoom or seek on scope changes.
- `deploy/viewport.js`: per-clip zoom/pan. Keep video and both overlays on the same transformed plane, and never pause playback for view changes.
- `deploy/drawing.js`, `deploy/annotations.js`: annotation geometry/history, pointer tools and PNG export. Keep coordinates normalized to the unmirrored video image, not the stage.
- Keep main controls and explanatory text at 16px and secondary labels at least 14px. Check phone layouts when changing type or tools.
- `tests/analysis.test.js`, `tests/studio.spec.js`: unit and Chrome browser tests.
- `tests/fixtures/`: synthetic MP4s with different orientations and durations.
- `README.md`: workflow, limitations, data privacy and deployment details.

## Commands

- `npm ci`
- `npm start` (Python 3 static server, port 8080)
- `npm test`
- `npm run test:browser` (installed Chrome; optional `POSE_FIXTURE` for real inference)
- `npm run deploy` (existing Cloudflare login required)

## Conventions

Use readable ES modules and browser APIs; there is no build step. Keep uploaded files as local object URLs and revoke them when removed. Low-confidence pose measurements must remain null. Compute angles in pixel coordinates, not normalized coordinates, and never claim 3D accuracy or an inferred swing score. Sync tests should cover positive/negative offsets and unequal clip durations. Document functional changes and run the relevant unit/browser checks before deploying.

### Visual key moments
- Preserve the visible seven-frame gallery after analysis. It is a core result, not an optional tab or PDF-only feature. Cards appear as soon as a video loads, support one-click marking and frame jumps, and show automatic previews after Analyze. Desktop portrait videos use a tall player plus a four-column, two-row gallery. All seven cards, including Finish, have equal width; never stretch the last card across a row. Landscape/comparison use a filmstrip; phones keep it after the player controls.
- `keyframes.js` proposes ordered pose-based frames but never labels sampled fallback frames as detected golf phases. Keep Estimate / Your mark / Range preview provenance clear. Manual marks override all suggestions, and reanalysis/cancellation must preserve edits.
- `keyframe-views.js` uses independent local decoders and bounded canvas caches. Preparing previews must never seek the main players, change synchronization or trigger common controls. Frame editing respects File FPS/Shot FPS and file-time storage.
- Preserve the enlarged single/A-B inspection view, direct frame jumps, play/draw actions, full-frame aspect ratio and overlay/drawing alignment. Avoid per-playback-frame canvas redraws for unchanged previews. PDF export includes the visual moments with provenance labels. Never mutate live suggestions when constructing reports.

### Automatic detection and marker proximity
- Preserve automatic key-moment detection as a core Analyze result. Use local swing sequences, tolerate brief pose gaps and one occluded wrist, and respect real-time FPS calibration. Idle or untracked footage elsewhere in the selected range must not discard a visible complete swing. Never silently replace detection with manual-only marking.
- Keep one coherent set of seven colored moment cards. Each card owns its full frame preview, jump target, time and Set A/Set B action. Keep Edit A/B and enlargement in the gallery header. Do not add a second marker rail that steals video height, bury phases in a dropdown or move marking across the screen.
- Use the same phase colors, names and numbers throughout cards, editor and reports. Keep Auto estimate, Your mark and Range preview distinct; sampled previews never count toward tempo. Manual corrections override auto estimates and can be reset to the estimate.
- Apply proximity to every change: identify the object and controls used together; place them together; inspect loaded/analysed single and comparison states at laptop, large desktop and phone sizes. Check actual video height, pointer reachability and independent controller state, not just element existence.

### Mode-aware wording
- Single video mode uses Play/Pause, Your swing, Set here and Edit frames. Hide A/B target selectors and omit A/B from range, drawing counts, accessibility labels, tooltips, dialogs and exported PDF/PNG labels. Compare mode retains explicit A/B labels. Relabel when modes change without resetting videos, marks, drawings, timing or zoom.

### Feature preservation
- Read `ORIGINAL_FEATURE_AUDIT.md` before changing analysis or review workflows. The original source baseline is `8cc316e`; distinguish working controls from dormant code and ungrounded scores.
- Preserve the restored eight 2D measurements, per-video overlays and head/both-hand trails, reference overlay, source-area crop, Detailed analysis, phase alignment, explicit range looping, labels/boxes/transforms/copying and keyboard navigation. Keep source-coordinate annotations and cached crop results intact.
- An interface redesign must inventory the existing features and provide a tested equivalent for each useful capability. Do not silently delete features, hide core tasks behind tabs, shrink text to force a fit, or substitute random scores for observations.
- Render-check analyzed single and compare layouts, including the current sidebar contents, not only the empty page.
