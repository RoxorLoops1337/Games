// Child process for tests/graftwork_templates.test.mjs: prints the card render hash. argv[2] = 'plain' (templates untouched)
// | 'empty' (templates configured with a manifest holding no card frames) | 'broken' (manifest fetch fails).
// The identity guard pins the ORIGINAL call sequence: the round 2 card face buckets are switched off here.
globalThis.__gwFlags = { faceLod: 0 };
const { renderHash } = await import('./graftwork_rec_lib.mjs');
const mode = process.argv[2] || 'plain';
if (mode !== 'plain') {
  const { templates } = await import('../graftwork/ui/templates.js');
  const man = mode === 'empty' ? { version: 1, frames: {}, icons: {}, atlases: {} } : null;
  templates.configure({ art: true, live: true, fetchJson: () => (man ? Promise.resolve(man) : Promise.reject(new Error('404'))), makeImage: () => ({}) });
  templates.ensure();
  await new Promise((r) => setTimeout(r, 5));
}
const r = await renderHash();
console.log(JSON.stringify(r));
