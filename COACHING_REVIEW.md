# Plain-language swing feedback

The original code had good/warning/bad feedback, but some rules treated projected image angles as universal ideal positions, inferred 3D rotation and included random scores. The redesign retained numbers and generic guidance without enough explanation. The user correctly identified that this did not replace understandable coaching.

`coaching.js` now supplies structured, deterministic suggestions through `review.js`'s shared `frameAnalysis`. Inline Analysis, the enlarged frame and each PDF page use identical findings and practice instructions. The original point-by-point evaluation style is restored above the eight supporting measurements online. Each named checkpoint has an icon, written status and plain-language explanation: green **Good**, amber **Needs attention**, neutral **Check visually** or **Not enough data**. **Try next** gives a rehearsal after the checklist. Status counts summarize the findings without inventing an overall score. Opening a report stays beside Set and preserves both players.

## What is personalized

- Compare the lead elbow with this golfer's tracked address at backswing, top and impact. A similar projected arm shape receives a consistency observation. Clear additional folding prompts checking swing width and a comfortable shorter backswing or half-swing rehearsal.
- Compare the trail elbow with top (downswing/impact) or impact (follow-through). Clear opening receives an unfolding observation. Additional folding at impact prompts checking the marker and inward pulling.
- Address and finish can receive a steadiness observation only when the adjacent sequence shows visible shoulders, hips and feet staying in position. This does not prove balance or weight transfer.
- Every phase now includes all its original checkpoints, plus relevant supported observations; the two-finding limit is removed. The checklist retains useful strengths and attention points together, including when other checks are uncertain. Missing tracking leaves the affected point visible with **Not enough data**. Rotation, sequencing, club hinge/clubface and balance cannot be graded from one projected frame; their **Check visually** rows give a review prompt instead of inventing a passed or failed check.
- Impact/follow-through can describe torso tilt as similar to the golfer's own address, or prompt reviewing a clear change. This is apparent image tilt, not a diagnosis of early extension. Backswing/impact can describe a similar projected hand-to-forearm shape; changed wrist geometry alone is not labeled a fault or used to infer clubface direction.

## Original checklist coverage

The original `jt` phase rules and `Rt`/`ee` feedback renderers at `8cc316e` were inspected. Their compact icon-and-explanation format is retained without reviving uncalibrated ideal-angle grading.

| Phase | Points retained |
| --- | --- |
| Address | Torso posture, lead arm, knee flex, lead wrist, shoulder/hip alignment; settled setup added |
| Backswing | Lead arm, shoulder turn, shoulder/hip movement, lead wrist |
| Top | Shoulder turn, hip turn, separation, wrist hinge, trail elbow, lead knee; lead-arm comparison added |
| Downswing | Hip-led transition, wrist hinge/lag, shoulder/hip movement, lead arm; trail-arm comparison added |
| Impact | Lead arm, lead wrist, hip turn, torso posture, knee flex; trail arm and contact-frame verification added |
| Follow-through | Trail arm, shoulder turn, torso posture |
| Finish | Body turn, balance, torso posture, lead leg |

The popup keeps its frame and frame-edit/play controls visible beside an internally scrolling evaluation on desktop. Changing phase returns the report to its first checkpoint. Inline reports use the same checklist and keep the main players fixed. PDFs print every point with identical wording, all eight measurements, and one large watermarked image per page. PDF note columns are measured before layout so longer evaluations do not collide with the footer.

Change detection uses three or more samples within ±0.08 real seconds, at least 80% valid values, an 18-degree maximum neighborhood spread and an exact-frame/median difference no larger than 10 degrees. Reference neighborhoods must not overlap or reverse. A lead change within 10 degrees with combined spread at most 12 is described as similar; directional changes must exceed both 20 degrees and the combined spread. These conservative engineering tolerances suppress noise; they are **not validated ideal technique thresholds**. Missing references stay missing. File/Shot FPS calibration, handedness and source pixel geometry are preserved.

Steadiness checks cover 0.25 seconds before address or 0.6 seconds after finish, require at least four fully tracked samples and 80% time coverage, and reject gaps over 0.1 seconds. Selected joints must stay within 12% of visible torso length. This heuristic describes what remains still in the camera view; it does not measure center of pressure. The suggested three-count finish rehearsal is separate from the shorter observed sequence.

## Coaching basis

- [PGA professionals Pete Styles and Matt Fryer: lead-arm position](https://golf-info-guide.com/video-golf-tips/should-your-left-arm-stay-straight-in-the-golf-backswing-video-lesson-by-pga-pros-pete-styles-and-matt-fryer/) discuss width, individual flexibility and using a comfortable backswing length. The app avoids telling users to force an elbow straight.
- [PGA: Swing Like Sam — Line Up that Lead Arm](https://www.pga.com/story/swing-like-sam-line-up-that-lead-arm) informs the chest-and-arm coordination checkpoint.
- [PGA: The Golf Ball Isn't the Finish Line](https://www.pga.com/story/become-a-better-ball-striker-the-golf-ball-isnt-the-finish-line) informs continuing through impact and holding the finish for a count of three.
- [Kinovea: angle measurement](https://www.kinovea.org/help/en/measurement/angle.html) and [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) frame the limitations of image geometry and visibility. The app does not infer 3D turn, clubface, ball flight, wrist cupping, early extension or an overall skill score from these measurements.

These are sources for practice ideas and measurement limitations, not validation of the app's thresholds. The feedback is not a trained golf-coaching classifier. Camera movement, projection and bad phase estimates can affect findings; the report asks users to verify the frame. Uncertain range previews get identification instructions, and untracked frames get recording/analysis instructions.

## Regression checks

Unit tests cover contrasting observed arm patterns, reference ordering/missingness, sparse/noisy/occluded tracking, handedness, slow motion, hold duration and all seven phase prompts. Browser tests cover online/PDF wording parity, per-video independence, marker/handedness refresh, missing data, playback isolation and responsive layouts. PDF pages are rendered and inspected with their large, watermarked images intact. Synthetic tests verify behavior, not coaching accuracy against a labeled golf dataset.

The prior coaching change passed 55 unit checks and nine browser/PDF checks, including a final five-test frame-report rerun. Loaded/analyzed single and compare layouts were inspected at 1280, 1440 and 2560 desktop widths and 390-pixel phone width. Eight-page single, 16-page compare and seven additional long-feedback PDF pages were checked for footer collisions; portrait/landscape output and all moment layouts were rendered for visual review.

Restored-checklist verification: 57 unit tests pass. Ten distinct browser/PDF checks pass, including the final six-test frame-report rerun after layout fixes. The popup was inspected with loaded/analyzed single and compare videos at laptop/desktop and phone sizes; its desktop frame controls stay visible while the evaluation scrolls. All original phase checkpoints are covered by tests, observed strengths/concerns appear first, and phase navigation resets the reading position. The eight-page single report, 16-page compare report and 56-page phase/evidence/aspect-ratio matrix were checked for page/footnote overflow. Representative portrait and landscape pages were rendered and visually inspected with complete wording and image watermarks preserved.
