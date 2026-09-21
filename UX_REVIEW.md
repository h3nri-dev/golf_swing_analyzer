# Swing Studio UX review — 21 September 2026

## Method and limits

Reviewed the production version at commit `4c826ea`, performed a task walkthrough in Chrome with local synthetic videos, and compared the interaction design with primary UX and accessibility guidance. This is a heuristic review and task-based software validation, **not a study with golfers**. The changes below are design hypotheses backed by those sources and the observed interface. Automated checks establish behavior and layout, not user satisfaction or full WCAG conformance.

The user's requirements remain constraints: two modes, local processing, persistent zoom, drawing beside the video, independent playback, selectable analysis ranges, and a screen-sized workspace with scroll snapping.

## Tasks used to judge the interface

1. Open one clip, pause it, draw a reference line, undo it, and save the annotated image.
2. Load a reference clip, position each at impact, align them, and play them together.
3. Turn synchronization off, play only B, and step A without disturbing B.
4. Select a short section of B, analyze it, and find its results.
5. Change settings and return to the video using a keyboard or a small touchscreen.
6. Cancel an accidental removal or replacement without losing the current work.

## Findings and changes

| Observed problem | Consequence | Applied change |
| --- | --- | --- |
| The linked comparison displayed a shared Play control and a Play both button under each video. | Three buttons appear to have different purposes although they do the same thing. | The subsequent user request requires all three controllers to remain visible in comparison. Each local player now affects only its own clip, while the bottom player explicitly affects both. Local playback releases sync; common controls respect its current state. Distinct labels and behavior make the scopes explicit. |
| Align marks was disabled until points were marked in the Video panel. | The entry point gives no way to discover or satisfy its prerequisites. | Set alignment pauses the pair, exposes independent timelines and an inline instruction. Align frames uses the two visible frames, confirms the offset, and restores shared playback. |
| The Range panel was open before a video had been added, alongside many inactive controls. | First use starts with configuration instead of viewing. | Panels start closed, maximizing the viewing area. A persistent Help entry offers three concrete tasks without requiring a tour. |
| Pose showed unexplained dashes before analysis. Analyze range did not identify which comparison clip would be scanned. | Users must infer missing prerequisites and remember the active target. | The tab is named Results, with an explicit empty state. Analyze A/B identifies the target; the desktop range shortcut shows the exact interval. Finished analysis exposes View results. |
| Clicking an already active tab closed it, and keyboard Tab passed through unrelated video controls before reaching the panel. | Panel navigation differs from familiar tab behavior. | Activating a tab consistently opens it. Arrow keys change panels; Tab enters the panel; Shift+Tab returns to its tab. Back to video and Escape restore focus to a visible control. Resizing or rotating preserves the open panel. |
| The mobile panel could cover the video, with only an × as an exit. | It is unclear how to get back to drawing or playback. | A labeled Back to video button. Tool selection retains the current desktop layout and returns compact screens to the video. |
| Removing or replacing an annotated clip immediately cleared its session work. | A mistaken action loses drawings, moments and analysis. | A native confirmation identifies the affected clip and consequences, with Keep current video focused by default. Clips without session work do not require confirmation. |

## Research basis

- **Prioritize common actions and make secondary controls discoverable.** [NN/g, Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) supports deferring infrequent options while keeping frequently combined actions together. Playback, seeking, zoom, drawing tools and synchronization remain in the working view. Settings and results are one clearly labeled panel away.
- **Show state and provide recovery.** [NN/g, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) informed the selected-swing badges, alignment feedback, meaningful empty states, consistent exits and protection against losing session work.
- **Use familiar keyboard interactions.** [W3C APG, Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) informed activation and focus movement. Native dialogs handle focus containment and Escape for Help and discard confirmation. Closed controls panels remain explicitly reopenable from the toolbar.
- **Make targets easier to activate.** [W3C, Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) describes a 24 CSS pixel minimum, with exceptions, and recommends larger targets where possible. Primary controls generally use 36–44 pixel heights; compact layouts preserve at least 28 pixels for tool icons. Removal buttons and timelines were enlarged. This is not a claim that every WCAG criterion has been audited.
- **Match the sports-video mental model.** [Kinovea, Comparison and synchronization](https://www.kinovea.org/help/en/observation/comparison.html) documents independent timelines and synchronizing the currently visible frames at a shared event. This supports the revised impact-alignment workflow and explicit separation of joint and individual playback.

## Validation and next research

Regression tests cover drawing, export, range selection, real local pose inference, zoom and independent playback. Task checks additionally cover alignment without hidden prerequisites, the number and scope of visible playback controls, selected analysis target, result discovery, keyboard focus, native dialog cancellation, and mobile comparison controls. Layout checks use 1440×900, 1280×720, 2560×1440, 390×844, 320×568 and 844×390 viewports, including actual drawings and marked-frame menus.

Before claiming improved usability in practice, observe golfers using their own clips. A useful next round would include five participants across desktop and phone, ask them to complete tasks 1–4 without coaching, and record completion, wrong-clip actions, requests for help and where they hesitate. In particular, test whether “Set alignment” and “Align frames” communicate the two steps and whether users discover the drawing settings. Revise labels and placement based on those observations; do not infer success from page visits or automated test results.
