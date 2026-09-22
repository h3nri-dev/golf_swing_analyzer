# Swing Studio

Read `CLAUDE.md` for the static app architecture, deployment and regression checks.

The user's standing UX requirement is **proximity**: controls used together belong together, beside the video or object they affect. Apply it proactively to every change; do not wait for the user to repeat it.

- Preserve automatic key-frame detection and the six visible visual moment cards. Never replace Analyze results with a manual-only workflow.
- Put one-click Set A / Set B and jump actions on those cards. Keep phase colors, names and numbers consistent. Do not hide phases in a dropdown, add duplicate marker rails or move marking to the far-right settings sidebar.
- Keep automatic estimates, user edits and uncertain range previews distinct. Manual edits survive reanalysis and can be reset. Only real phase estimates/marks contribute to tempo.
- Keep each video's full playback controls and the common controller visible. Local actions leave the common display and the other independently playing video alone.
- Preserve neighboring range/Analyze/playback controls, neighboring sync/alignment controls, compact persistent zoom, and vertical drawing tools beside the footage.
- Judge layouts with loaded and analyzed videos at laptop, large desktop and phone sizes. Check usable video size, readable labels, reachable click targets and no overlapping controls. Preserve the enlarged key-frame viewer and PDF export.
- Keep the app static and local-only, consent-gated analytics, legal links and golf branding intact. Run applicable unit/browser checks and inspect screenshots before committing/deploying.

- Use neutral labels in Single video mode: Play, Pause, Your swing, Set here and Edit frames. Reserve A/B identifiers and target selectors for Compare mode, including dialogs, accessibility labels and exports.
