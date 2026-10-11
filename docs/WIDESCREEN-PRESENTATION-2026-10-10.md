# Widescreen presentation and slide capture

## Problem and scope

The old logical viewport was 1300 × 860 (about 1.51:1), not the 16:9 ratio used by a widescreen slide. Presentation additionally capped enlargement at 1× and kept toolbar/padding in fullscreen. A screenshot therefore left unused slide width unless stretched or cropped.

This release changes presentation geometry, column controls, and the shared HTML renderer. It does not modify cloud projects, authentication, accounts services, or image generation providers.

## Changes

- One 1600 × 900 logical canvas for B2C and B2B, live preview, Preview & Present, and newly generated HTML exports. Scaling is uniform, including enlargement to 1920 × 1080 and larger matching-ratio viewports.
- Fullscreen targets only the profile canvas, excluding generator controls and padding. Escape exits fullscreen. Unsupported/blocked fullscreen shows an inline explanation. A delayed fullscreen result cannot modify a subsequently opened presentation.
- Exported documents include their own host fitting for narrow browsers and partner iframes. The physical document height follows the scaled content, so optional modules below the first screen remain scrollable. Logical layout measurements are kept separate from host scale.
- B2C has left, middle, and right sliders plus Reset column widths. Widths rebalance within the 1548px content budget (1600px minus borders, padding, and gaps). Default widths: 320 / 400 / 828.
- Legacy B2C layouts preserve the former rendered middle width (stored width + 40px). Merely displaying an old project does not mutate saved state; editing a slider stores the normalized three-column layout.
- B2B retains Account Rail and Action Rail controls and their existing saved-field meaning; its center workspace uses the remainder. New B2C defaults do not overwrite B2B defaults.
- Outer and bounded list scrollbar tracks are hidden for cleaner capture; scrolling and keyboard-focusable lists remain available. No authored rows/cards are discarded to force a one-screen fit.
- The preview badge, Step 7 instructions, and AI composition guidance describe the new widescreen canvas. The standalone generator bundle was rebuilt.

Previously downloaded HTML files are not retroactively changed. Reopen the project in the updated builder and export again.

## User workflow

1. Select the desired persona and open **Preview & Present**.
2. Choose **Full screen · clean capture** and screenshot the profile.
3. In Google Slides, set **File → Page setup → Widescreen (16:9)**. Place the image on a blank slide and resize proportionally from a corner.
4. On a display that is not 16:9, capture only the profile rectangle, excluding any outer bars. Filling an arbitrary screen ratio and a 16:9 slide simultaneously without bars, cropping, or distortion is not possible.

A screenshot captures the visible screen, not every optional module below the fold. Use the builder's Suggested module area for a concise first-screen composition. This release does not add a direct PNG download or clipboard image exporter.

Google's page-size instructions: https://support.google.com/docs/answer/3447672/change-the-size-of-your-slides-computer

## Verification

- `npm run build`: passed; standalone bundle/source parity is covered by tests.
- Full `npm test` rerun: **163/163 passed**.
- New regression coverage includes 16:9 scaling above and below native size, narrow export hosts, retained below-fold height, logical layout reporting, all three column budgets/echoes, legacy load/edit/save behavior, B2B semantics, clean fullscreen targeting, unavailable/rejected fullscreen, stale callbacks, and observer cleanup.
- Both render modes and ten industry/mode fixtures remain covered, along with the existing personalization, export, safety, save/recovery, and accessibility-contract tests.
- One earlier full run hit a pre-existing timing-sensitive 30ms image-decoder concurrency test (`3 !== 2` spawned processes). Its isolated rerun passed 15/15 and the full rerun passed 163/163. No decoder code or test was changed for this presentation release.
- `git diff --check`: passed.
- **Visual check not completed:** repository preview tools were unavailable. The user approved the built-in browser, but an administrator-enforced browser policy blocked the local test URL. No alternate browser or policy workaround was attempted. No live deployment, real Google Slides insertion, or fullscreen screenshot is claimed as verified.

### Remaining acceptance checks after deployment

- Open a saved B2C profile, compare live preview to presentation, then enter/exit fullscreen at 1920 × 1080 and on a non-16:9 display.
- Capture the profile rectangle and insert it into a 16:9 blank slide; check edge-to-edge fit without stretching.
- Exercise each column slider and Reset. Switch persona, save/reload, and confirm widths/content remain consistent.
- Check B2B Overview, Sales, and Success tabs, including a long custom module and activity/recommendation scrolling.
- Open a newly downloaded HTML file in a smaller laptop window or partner iframe and verify its complete width and access to content below the first screen.

## Rollback

The starting point is preserved locally and on origin as **`upg-widescreen-baseline-2026-10-10`**, pointing to `b41f556` (the completed customer-logo fix).

If rollback is requested, prefer reverting the widescreen release commit on `main` and pushing the revert. Do not reset shared history or overwrite subsequent unrelated work. No database migration or project-data rollback is needed.
