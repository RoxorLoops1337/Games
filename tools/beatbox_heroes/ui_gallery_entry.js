// esbuild entry for ui_shot.mjs: exposes park3d/ui3d.js createUI to the r3 UI gallery page.
import { createUI } from '../../beatbox_heroes/park3d/ui3d.js';
window.__createUI3D = createUI;
