// style.js: the visual style. The game has ONE look, the crayon notebook doodle. A stored 'classic' value in an old save is ignored.
// The classic art_*.js modules stay in the repo only because the facades still import them; nothing in the UI can reach them.
export const getStyle = () => 'doodle';
export const isDoodle = () => true;
export function setStyle() { return 'doodle'; }
export const STYLES = ['doodle'];
