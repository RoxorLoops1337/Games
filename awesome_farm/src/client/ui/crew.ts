// What the "put a creature to work" screens share: skill pips, how fast a creature is, its job in words, and tooltips.

import type * as Phaser from 'phaser';
import { TUNING } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import { AREA_INFO, ELEMENT_COLOR, Pet, spOf, STATUS_INFO, WORK_INFO, workCycle, type PostStatus, type WorkKind } from '../../shared/data/creatures';
import { PAL } from '../../shared/palette';
import { machineBoost } from '../../shared/sim/jobs';
import { derived } from '../../shared/sim/stats';
import type { Ent, PlayerS, Plot } from '../../shared/sim/types';
import type { TipData } from './kit';
import { rect } from './px';
import { LOCKED } from './theme';

export const aptOf = (pet: Pet, kind: WorkKind) => spOf(pet.sp).work[kind] ?? 0;

/** Five pips: how good a creature is at something. */
export function pips (g: Phaser.GameObjects.Graphics, x: number, y: number, n: number, color: number, size = 7) {
    for (let i = 0; i < 5; i++) rect(g, x + i * (size + 2), y, size, size, i < n ? color : LOCKED, 1);
}

/** Seconds one go at an island job takes this creature (walking not counted). */
export function secsPerJob (me: PlayerS, pet: Pet, kind: WorkKind) {
    const base = workCycle(pet, kind, derived(me).mods.work ?? 0) / TUNING.postSpeed;
    return Math.round((kind === 'guard' ? Math.min(1.2, base) : Math.max(0.6, base)) * 10) / 10;
}

export const jobName = (kind: WorkKind) => WORK_INFO[kind].name;
export const plotName = (p: Plot) => `island ${p.gx + 1}·${p.gy + 1}`;

/** "Lumber, island 3·4" or "Furnace" for a creature's post. */
export function postText (plots: readonly Plot[], ents: Readonly<Record<number, Ent>>, pet: Pet): string {
    const post = pet.post;
    if (!post) return pet.den !== undefined ? 'Working in a den' : '';
    if (post.k === 'plot') { const p = plots[post.plot]; return `${jobName(post.job)}${p ? `, ${plotName(p)}` : ''}`; }
    const b = ents[post.id];
    return b && b.k === 'bld' ? `${BUILDINGS[b.kind].name}${post.ord ? ` · order of ${post.ord.n}` : ''}` : 'a workshop out of sight';
}

export const statusOf = (pet: Pet): PostStatus => pet.ps ?? 'work';

/** A creature's strengths and speed, for hover tips in the job screens. */
export function crewTip (_me: PlayerS, pet: Pet, kind?: WorkKind, foot?: string): TipData {
    const sp = spOf(pet.sp);
    const lines: { t: string; c?: number }[] = [];
    const kinds = (Object.entries(sp.work) as [WorkKind, number][]).sort((a, b) => b[1] - a[1]);
    for (const [k, a] of kinds) {
        const mark = k === kind ? '▶ ' : '';
        lines.push({ t: `${mark}${WORK_INFO[k].name}  ${'●'.repeat(a)}${'○'.repeat(5 - a)}`, c: k === kind ? PAL.gold : WORK_INFO[k].color });
    }
    if (pet.post) lines.push({ t: `Now: ${STATUS_INFO[statusOf(pet)].text}`, c: STATUS_INFO[statusOf(pet)].color });
    return { title: pet.name, color: ELEMENT_COLOR[sp.element], sub: `${sp.name} · Lv ${pet.lv}`, lines, foot };
}

/** What a job on an island means, with this creature's speed. */
export function jobTip (me: PlayerS, pet: Pet, kind: WorkKind): TipData {
    const apt = aptOf(pet, kind);
    const info = WORK_INFO[kind];
    if (!apt) return { title: info.name, color: PAL.pebble, lines: [{ t: `${spOf(pet.sp).name} is no good at this.`, c: PAL.pebble }] };
    return {
        title: info.name, color: info.color,
        lines: [{ t: AREA_INFO[kind] ?? info.desc, c: PAL.cream }, { t: `${pet.name}: about ${secsPerJob(me, pet, kind)}s a go`, c: PAL.gold }],
        foot: 'Click to put it on this job',
    };
}

/** What running a machine or a workshop means for this creature. */
export function stationTip (me: PlayerS, pet: Pet, kind: keyof typeof BUILDINGS, ordRecipeSecs?: number): TipData {
    const def = BUILDINGS[kind];
    const skill = def.work!;
    const info = WORK_INFO[skill];
    const lines: { t: string; c?: number }[] = [{ t: `Needs ${info.name} (${'●'.repeat(aptOf(pet, skill))}${'○'.repeat(5 - aptOf(pet, skill))})`, c: info.color }];
    if (def.proc) lines.push({ t: `Machine runs ${Math.round(machineBoost(pet, skill, derived(me).mods.work ?? 0) * 100)}% faster with ${pet.name}`, c: PAL.lime });
    else if (ordRecipeSecs) lines.push({ t: `About ${Math.round(ordRecipeSecs * 10) / 10}s for each one`, c: PAL.gold });
    return { title: def.name, color: PAL.cream, lines, foot: 'Click to put it on this job' };
}

