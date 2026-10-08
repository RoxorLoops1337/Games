// Gives every farmer already in a world a name and a secret word, so they can sign in from any device and always be the same farmer.
// Run it on a world file while the server is STOPPED (a running server would write its own copy over the change):
//
//   npx tsx scripts/make-accounts.ts <world.json> <logins.txt>
//
// The names are the farmers' own names (made unique if two share one); the secret words are made up here, stored only as salted hashes
// in the world, and written once, in plain text, to the logins file for the owner to hand out. Farmers who already have an account are left alone.

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { hashKey } from '../src/shared/net/sha256';
import type { WorldState } from '../src/shared/sim/types';

const [file, out] = process.argv.slice(2);
if (!file || !out) { console.error('usage: tsx scripts/make-accounts.ts <world.json> <logins.txt>'); process.exit(2); }

const WORDS = ['amber', 'otter', 'maple', 'comet', 'pepper', 'sprout', 'lantern', 'ferret', 'meadow', 'willow', 'copper', 'badger', 'cobalt', 'puffin', 'thistle', 'walnut', 'ember', 'falcon', 'harbor', 'juniper', 'kettle', 'marble', 'nimbus', 'orchid',
    'pickle', 'quartz', 'raven', 'saffron', 'tulip', 'umber', 'violet', 'wombat', 'yarrow', 'zephyr', 'acorn', 'bramble', 'clover', 'dingo', 'fennel', 'gadget', 'hazel', 'indigo', 'jigsaw', 'kiwi', 'lemon', 'mango', 'nutmeg', 'olive'];
const pick = () => WORDS[randomBytes(2).readUInt16BE() % WORDS.length];
const hex = (n: number) => randomBytes(n).toString('hex');

const world = JSON.parse(readFileSync(file, 'utf8')) as WorldState;
const accounts = (world.accounts ??= {});
const taken = new Set(Object.keys(accounts));
const bound = new Set(Object.values(accounts).map((a) => a.id));
const lines: string[] = [`Logins for ${world.name ?? 'the world'} (made ${new Date().toISOString().slice(0, 16).replace('T', ' ')})`, 'Name and secret word: type both on the title screen when you join, on any device.', ''];

for (const p of Object.values(world.players)) {
    if (bound.has(p.id)) continue;
    let name = p.name.trim().replace(/[^\p{L}\p{N} _.'-]/gu, '').slice(0, 16).trim();
    if (!/^[\p{L}\p{N}]/u.test(name) || name.length < 2) name = `Farmer${p.slot + 1}`;
    let n = 2, unique = name;
    while (taken.has(unique.toLowerCase())) { unique = `${name.slice(0, 13)}${n++}`; }
    name = unique;
    const key = `${pick()}-${pick()}-${10 + (randomBytes(1)[0] % 90)}`;
    const salt = hex(6);
    accounts[name.toLowerCase()] = { id: p.id, salt, h: hashKey(key, salt) };
    taken.add(name.toLowerCase());
    p.name = name;
    lines.push(`${name.padEnd(18)} secret word: ${key}      (farmer level ${p.level}, ${p.online ? 'online' : 'offline'})`);
}
writeFileSync(file, JSON.stringify(world));
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${lines.length - 3} accounts made. Logins written to ${out} (keep that file private).`);
