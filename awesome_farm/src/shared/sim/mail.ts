// The mailbox: a friend leaves you up to three stacks and a short note, and every dawn one of the island folk sends a postcard with a
// small present. Mail belongs to the farmer (`PlayerS.mail`), not to the building: any mailbox its owner built opens their post, and
// a mailbox somebody else built opens a form to send to that owner. A mailbox shows a raised flag (`BuildE.flag`) while its owner has
// post waiting. Sending is immediate (the things leave your pockets and wait in the other farmer's mail), so nothing is ever lost.

import { Rng } from '../rng';
import { POSTCARD_LINES, POSTCARD_SEEDS } from '../data/postcards';
import { GIVERS } from '../data/sidequests';
import { ITEMS, type ItemId, type Res } from '../data/items';
import { PAL } from '../palette';
import type { Sim } from './sim';
import { takeItem } from './stats';
import type { BuildE, Cmd, PlayerS } from './types';

export const MAIL_CAP = 20;           // letters waiting for one farmer
export const PARCEL_STACKS = 3;       // different things in one parcel
export const PER_SENDER = 3;          // letters from the same friend waiting at once
export const NOTE_MAX = 60;
export const POSTCARDS_KEPT = 3;      // old postcards fall away so they never pile up

const GIVER_IDS = Object.keys(GIVERS);
const text = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max);
const isRes = (r: unknown): r is Res => typeof r === 'string' && (r === 'coin' || Object.prototype.hasOwnProperty.call(ITEMS, r));

/** The mailboxes of a farmer. */
const boxesOf = (sim: Sim, id: string) => sim.buildings('mailbox').filter((e) => e.by === id);

/** Raise or lower the flag on every mailbox of this farmer. */
export function refreshFlags (sim: Sim, p: PlayerS) {
    const up = (p.mail?.length ?? 0) > 0;
    for (const b of boxesOf(sim, p.id)) if (!!b.flag !== up) { if (up) b.flag = 1; else delete b.flag; sim.touch(b); }
}

/** A farmer used a mailbox: their own opens the post, somebody else's opens a form to write to its owner. */
export function open (sim: Sim, p: PlayerS, b: BuildE) {
    sim.events.push({ e: 'open', to: p.id, ui: 'mail', id: b.id });
}

/** Cmd: send a parcel from a friend's mailbox, or take what is waiting from your own. */
export function cmdMail (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'mail' }>) {
    const b = sim.reachableBuilding(p, c.id, undefined, 'mailbox');
    if (!b) return;
    if (c.op === 'take') return take(sim, p, b, c.i);
    if (c.op === 'send') return send(sim, p, b, c);
}

function send (sim: Sim, p: PlayerS, b: BuildE, c: Extract<Cmd, { t: 'mail'; op: 'send' }>) {
    const to = b.by ? sim.s.players[b.by] : undefined;
    if (!to) { sim.deny(p, 'Nobody collects the post from this mailbox'); return; }
    if (to.id === p.id) { sim.deny(p, 'That is your own mailbox: ask a friend to write to you'); return; }
    if (!Array.isArray(c.items) || c.items.length < 1 || c.items.length > PARCEL_STACKS) { sim.deny(p, `A parcel holds one to ${PARCEL_STACKS} kinds of things`); return; }
    const items: [Res, number][] = [], seen = new Set<string>();
    for (const row of c.items) {
        if (!Array.isArray(row) || !isRes(row[0]) || !Number.isInteger(row[1]) || row[1] < 1 || row[1] > 99999 || seen.has(row[0])) return;
        seen.add(row[0]); items.push([row[0], row[1]]);
    }
    const mine = to.mail ?? [];
    if (mine.length >= MAIL_CAP) { sim.deny(p, `${to.name}'s mailbox is full`); return; }
    if (mine.filter((m) => m.fid === p.id).length >= PER_SENDER) { sim.deny(p, `${to.name} has ${PER_SENDER} of your letters waiting already`); return; }
    for (const [r, n] of items) if (r === 'coin' ? p.coins < n : (p.inv[r as ItemId] ?? 0) < n) { sim.deny(p, 'You do not have that much'); return; }
    for (const [r, n] of items) { if (r === 'coin') p.coins -= n; else takeItem(p, r as ItemId, n); }
    (to.mail ??= []).push({ from: p.name, fid: p.id, d: sim.s.day, note: text(c.note, NOTE_MAX), items });
    sim.fx('mail', b.tx * 16 + 8, b.ty * 16, p.id);
    sim.toast(p.id, `Parcel left for ${to.name}`, 'k_flag', PAL.lime);
    arrived(sim, to, p.name);
    refreshFlags(sim, to);
}

/** The receiver hears about it (a chime and a toast), if they are here. */
function arrived (sim: Sim, to: PlayerS, from: string) {
    if (!to.online) return;
    const b = boxesOf(sim, to.id)[0];
    sim.toast(to.id, `You have mail from ${from}`, 'k_flag', PAL.gold);
    if (b) sim.fx('mail', b.tx * 16 + 8, b.ty * 16, to.id); else sim.fx('mail', to.x, to.y - 10, to.id);
}

function take (sim: Sim, p: PlayerS, b: BuildE, i: number | undefined) {
    if (b.by !== p.id) { sim.deny(p, 'This is not your mailbox'); return; }
    const mail = p.mail ?? [];
    if (!mail.length) return;
    const list = i === undefined ? mail.splice(0, mail.length) : Number.isInteger(i) && mail[i] ? mail.splice(i, 1) : [];
    if (!list.length) return;
    const cx = b.tx * 16 + 8, cy = b.ty * 16 + 4;
    for (const m of list) for (const [r, n] of m.items) sim.give(p, r, n, cx, cy);
    if (!mail.length) delete p.mail;
    sim.fx('collect', cx, cy, p.id);
    sim.toast(p.id, list.length === 1 ? `Took the post from ${list[0].from}` : `Took ${list.length} letters`, 'k_flag', PAL.lime);
    refreshFlags(sim, p);
}

/** Every dawn: a postcard for every farmer, online or not (the oldest ones fall away). */
export function postcards (sim: Sim) {
    for (const p of Object.values(sim.s.players)) {
        const rng = new Rng(`${sim.s.seed}:post:${sim.s.day}:${p.id}`);
        const giver = GIVERS[GIVER_IDS[rng.int(0, GIVER_IDS.length - 1)]];
        const lines = POSTCARD_LINES[giver.id] ?? ['Thinking of you.'];
        const gift: [Res, number] = rng.chance(0.55) ? ['coin', rng.int(8, 20) + Math.min(40, p.level)] : [POSTCARD_SEEDS[rng.int(0, POSTCARD_SEEDS.length - 1)] as ItemId, rng.int(2, 4)];
        const mail = (p.mail ??= []);
        mail.push({ from: giver.name, d: sim.s.day, note: lines[rng.int(0, lines.length - 1)], items: [gift], pc: 1 });
        // keep only the newest few postcards; letters from friends are never dropped
        const cards = mail.filter((m) => m.pc);
        for (const old of cards.slice(0, Math.max(0, cards.length - POSTCARDS_KEPT))) mail.splice(mail.indexOf(old), 1);
        refreshFlags(sim, p);
    }
}

/** A farmer arrives with post waiting: the chime. */
export function onJoin (sim: Sim, p: PlayerS) {
    if (p.mail?.length) arrived(sim, p, p.mail[p.mail.length - 1].from);
    refreshFlags(sim, p);
}
