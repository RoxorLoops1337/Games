// style.js: which visual style is active. 'doodle' (crayon notebook, the default) or 'classic' (the polished AAA look).
let current = 'doodle';
export const getStyle = () => current;
export const isDoodle = () => current === 'doodle';
export function setStyle(s) { current = s === 'classic' ? 'classic' : 'doodle'; return current; }
export const STYLES = ['doodle', 'classic'];
