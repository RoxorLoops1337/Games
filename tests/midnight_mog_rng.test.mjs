import assert from 'node:assert/strict';
import { makeRng } from '../midnight_mog/js/rng.js';
const a = makeRng(7), b = makeRng(7);
for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
const st = a.getState(); const x = a.next(); a.setState(st); assert.equal(a.next(), x);
console.log('rng ok');
