// Child process for tests/graftwork_templates.test.mjs: prints the card render hash. argv[2] = 'plain' (templates untouched)
// | 'empty' (templates configured with a manifest holding no card frames) | 'broken' (manifest fetch fails).
import { renderHash } from './graftwork_rec_lib.mjs';
const mode = process.argv[2] || 'plain';
if (mode !== 'plain') {
  const { templates } = await import('../graftwork/ui/templates.js');
  const man = mode === 'empty' ? { version: 1, frames: {}, icons: {}, atlases: {} } : null;
  templates.configure({ live: true, fetchJson: () => (man ? Promise.resolve(man) : Promise.reject(new Error('404'))), makeImage: () => ({}) });
  templates.ensure();
  await new Promise((r) => setTimeout(r, 5));
}
const r = await renderHash();
console.log(JSON.stringify(r));
