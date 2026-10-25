// doodle_env.js: the DOODLE version. Starts as a re-export of the classic implementation so the game always runs; its owner replaces it with a crayon notebook doodle implementation built on doodle_kit.js (keep the exported names and signatures).
export { drawBackdrop, drawBoard, drawStageBase, setArtScale } from './art_env.js';
