// Extra suites for Cell Serpent live in this folder; every .mjs file here is imported by tests/cell_serpent.test.mjs.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const sim = await import(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent', 'sim.js'));
assert.ok(sim.MAX_STAGE === 50, 'the ext suite loads and can import the sim');
