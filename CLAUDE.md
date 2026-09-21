# Golf Swing Analyzer / Swing Studio

Repository: `h3nri-dev/golf_swing_analyzer`. Existing production host: Cloudflare Pages project `freegolfswinganalyzer`, serving `deploy/` at `freegolfswinganalyzer.com`.

This is a build-free, browser-only application. Keep production entirely static: no backend, secret, database or video upload. Do not add application analytics; the existing hosting-injected Cloudflare beacon is disclosed in the privacy dialog. Do not add a server runtime to support analysis. Node dependencies are development/testing/deployment tools only.

## Files

- `deploy/index.html`, `styles.css`: semantic responsive interface.
- `deploy/screen.js`, `deploy/screen.css`, `deploy/sidebar.css`: viewport-sized studio, permanent expanded right sidebar and native scroll snapping. Draw, Video, Range, Results and Moments must remain expanded without tabs. Keep normal desktop controls within the viewport; allow internal sidebar scrolling on short/narrow desktop screens or at high text zoom. On phones, stack the expanded sections below the players without covering them.
- `deploy/ux.js`, `deploy/ux.css`: task help, session-work confirmation and interaction refinements. `UX_REVIEW.md` records the research basis and task checks.
- `deploy/app.js`: two local video slots, single/compare modes, playback synchronization, lazy MediaPipe inference and export.
- Compare mode must keep both individual players and the common controller visible. Individual playback actions affect one clip and release sync; common actions affect both, respecting the current sync state. Keep zoom sliders compact.
- Group related controls together to minimize mouse travel. Keep Sync on/off and alignment immediately before the common playback controls, below the videos. Apply this proximity principle to future interface changes.
- `deploy/analysis.js`: pure calculation helpers; unit-test changes here.
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
