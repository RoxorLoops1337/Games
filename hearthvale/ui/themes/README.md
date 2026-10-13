# Interface styles

One style = `ui/themes/<id>.css` (+ optional `ui/themes/<id>.js`). Registered in `js/ui/theme.js` (THEMES). Every CSS rule MUST be scoped under
`html[data-ui="<id>"]` so styles never leak. The base `style.css` is the Classic style; a style restyles it by overriding
(`html[data-ui="gel"] .b { ... }` has higher specificity than `.b`). The markup is fixed (do not edit index.html or js/ui/*): style it with CSS,
pseudo-elements, CSS variables, SVG filters and generated assets (canvas, WebGL, inline SVG data URIs).

Preview without WebGL: `lab/ui_sheet.html?ui=<id>&scene=hud|build|building|valley|villagers|inventory|settings|levelup`,
all styles side by side: `lab/ui_styles.html?scene=hud`. Screenshot: `node hearthvale/lab/shot.mjs ui_sheet.html out.png "ui=gel&scene=hud" 390 800 2500`.
In the real game: `index.html?solo&ui=<id>`.
