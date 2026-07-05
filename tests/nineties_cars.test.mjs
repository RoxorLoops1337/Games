// Validates the '90s car model library: every mesh must be well-formed
// (valid indices, finite coords, sane colors), sit on the ground plane,
// stay within plausible car dimensions, and round-trip through OBJ export.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { cars, toObj } = require('../nineties_cars/cars.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

test('catalog has 20 cars', () => assert(cars.length === 20, `got ${cars.length}`));

test('ids are unique', () => {
  const ids = new Set(cars.map((c) => c.id));
  assert(ids.size === cars.length, 'duplicate id');
});

test('catalog fields are complete', () => {
  for (const c of cars) {
    assert(c.id && c.name && c.basis && c.category, `${c.id}: missing field`);
    assert(Number.isInteger(c.year) && c.year >= 1990 && c.year <= 1999, `${c.id}: year ${c.year} not in the 90s`);
    assert(Number.isFinite(c.price) && c.price > 0, `${c.id}: bad price`);
    assert(/^#[0-9a-f]{6}$/i.test(c.color), `${c.id}: bad color`);
    assert(typeof c.build === 'function', `${c.id}: no build()`);
  }
});

for (const c of cars) {
  test(`${c.id}: mesh is well-formed`, () => {
    const m = c.build();
    assert(m.verts.length > 50, 'too few verts');
    assert(m.faces.length > 40, 'too few faces');
    for (const v of m.verts) {
      assert(v.length === 3 && v.every(Number.isFinite), 'bad vertex');
    }
    for (const f of m.faces) {
      assert(f.idx.length >= 3, 'degenerate face');
      assert(f.idx.every((i) => Number.isInteger(i) && i >= 0 && i < m.verts.length), 'index out of range');
      assert(/^#[0-9a-f]{6}$/i.test(f.color), `bad face color ${f.color}`);
    }
  });

  test(`${c.id}: sits on the ground within car-sized bounds`, () => {
    const m = c.build();
    let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9, maxZ = 0;
    for (const [x, y, z] of m.verts) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      maxZ = Math.max(maxZ, Math.abs(z));
    }
    assert(Math.abs(minY) < 0.05, `bottom at y=${minY.toFixed(3)}, expected ~0 (wheels on ground)`);
    assert(maxY > 0.8 && maxY < 2.0, `height ${maxY.toFixed(2)} implausible`);
    const len = maxX - minX;
    assert(len > 3.4 && len < 5.2, `length ${len.toFixed(2)} implausible`);
    assert(maxZ > 0.6 && maxZ < 1.15, `half-width ${maxZ.toFixed(2)} implausible`);
  });

  test(`${c.id}: uses body color + glass or cockpit`, () => {
    const m = c.build();
    const colors = new Set(m.faces.map((f) => f.color));
    assert(colors.has(c.color), 'catalog color not present on mesh');
    assert(colors.has('#39566e') || colors.has('#191922'), 'no glass and no cockpit');
  });

  test(`${c.id}: OBJ export round-trips`, () => {
    const m = c.build();
    const { obj, mtl } = toObj(m, c.id);
    const vLines = obj.split('\n').filter((l) => l.startsWith('v ')).length;
    const fLines = obj.split('\n').filter((l) => l.startsWith('f ')).length;
    assert(vLines === m.verts.length, 'vertex count mismatch');
    assert(fLines === m.faces.length, 'face count mismatch');
    const mats = mtl.split('\n').filter((l) => l.startsWith('newmtl')).length;
    assert(mats === new Set(m.faces.map((f) => f.color)).size, 'material count mismatch');
    for (const line of obj.split('\n')) {
      if (!line.startsWith('f ')) continue;
      for (const tok of line.slice(2).trim().split(/\s+/)) {
        const i = Number(tok);
        assert(Number.isInteger(i) && i >= 1 && i <= m.verts.length, `bad OBJ index ${tok}`);
      }
    }
  });
}

console.log(`nineties_cars: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
