// The commands. `command` checks a farmer's Cmd (online, not a hostile object, not while the solo world is paused or the farmer
// is down, frozen or on an expedition for the things that need the home island) and hands it to the module that owns it; the
// farmer's own moves live here: move, swing, dash, look, respawn, summon. `Sim.command` is the entry point hosts and tests call.

import { TUNING } from '../config';
import { cleanLook, cleanScarf } from '../data/look';
import { hitPoint } from '../geom';
import * as blight from './blight';
import * as bond from './bond';
import * as boss from './boss';
import * as combat from './combat';
import * as costatus from './costatus';
import * as creatures from './creatures';
import * as defense from './defense';
import * as dev from './dev';
import * as economy from './economy';
import * as satchel from './satchel';
import * as gems from './gems';
import * as factory from './factory';
import * as fishing from './fishing';
import * as fortune from './fortune';
import * as gather from './gather';
import * as health from './health';
import * as hotbar from './hotbar';
import * as machines from './machines';
import * as mail from './mail';
import * as mines from './mines';
import * as potluck from './potluck';
import * as quests from './quests';
import * as rift from './rift';
import * as shop from './shop';
import * as social from './social';
import * as wish from './wish';
import type { Sim } from './sim';
import { derived, hasUnlock } from './stats';
import type { Cmd, PlayerS } from './types';

/** Names every object inherits (`constructor`, `__proto__`, `toString`…): never a valid id, and they would "find" something in a data table. */
const INHERITED = new Set(Object.getOwnPropertyNames(Object.prototype));
/** Does a command carry a string that is really an inherited property name? (Checked two levels deep: blueprint pieces hold ids.) */
function hostile (v: unknown, depth = 0): boolean {
    if (typeof v === 'string') return INHERITED.has(v);
    if (depth >= 3 || !v || typeof v !== 'object') return false;
    for (const x of Array.isArray(v) ? v.slice(0, 200) : Object.values(v)) if (hostile(x, depth + 1)) return true;
    return false;
}

export function command (sim: Sim, pid: string, c: Cmd) {
    const p = sim.s.players[pid];
    if (!p || !p.online || !c || typeof c !== 'object') return;
    if (hostile(c)) return;
    sim.fresh();                                 // (a command may learn a skill, change gear, give a buff…)
    if (c.t === 'pause') { if (sim.online.length === 1) sim.s.paused = !!c.on; return; }
    if (c.t === 'dev') return;                    // (unlocking is the host's: it checks the key)
    if (c.t === 'devdo') { dev.run(sim, p, c); return; }       // (the developer menu: only for an unlocked farmer, even while down)
    // a paused solo world still takes menu actions (craft, equip, skills…), just not world ones
    if (sim.s.paused && (c.t === 'move' || c.t === 'swing' || c.t === 'revive')) return;
    if (p.downed > 0 && c.t !== 'skill' && c.t !== 'equip' && c.t !== 'unequip' && c.t !== 'hot' && c.t !== 'respawn') return;
    if (costatus.blocks(p, c)) return;                // (frozen solid: no walking, swinging, digging, using or dashing; menus and food still work)
    if (p.rift && (c.t === 'build' || c.t === 'bp' || c.t === 'demolish' || c.t === 'travel' || c.t === 'buy' || c.t === 'summon')) { sim.deny(p, 'Not while you are on an expedition'); return; }
    switch (c.t) {
        case 'move': return cmdMove(sim, p, c);
        case 'swing': return cmdSwing(sim, p, c.id);
        case 'dig': return mines.cmdDig(sim, p, c);
        case 'use': return economy.cmdUse(sim, p, c.id, c.seed);
        case 'crate': return fortune.cmdCrate(sim, p, c);
        case 'fortune': return fortune.cmdFortune(sim, p, c);
        case 'buy': return economy.cmdBuy(sim, p, c.plot);
        case 'build': return economy.cmdBuild(sim, p, c.kind, c.tx, c.ty, c.rot ?? 0);
        case 'bp': return economy.cmdBlueprint(sim, p, c);
        case 'demolish': return economy.cmdDemolish(sim, p, c.id);
        case 'eat': return economy.cmdEat(sim, p, c.item);
        case 'sell': return economy.cmdSell(sim, p, c.item, c.n);
        case 'craft': return economy.cmdCraft(sim, p, c.recipe, c.n);
        case 'equip': return economy.cmdEquip(sim, p, c.item, false, c.slot);
        case 'hot': return hotbar.cmdHot(sim, p, c);
        case 'respawn': return cmdRespawn(sim, p);
        case 'look': return cmdLook(sim, p, c);
        case 'unequip': return economy.cmdUnequip(sim, p, c.slot);
        case 'gem': return c.op === 'set' ? gems.set(sim, p, c.socket, c.item) : c.op === 'clear' ? gems.clear(sim, p, c.socket) : c.op === 'merge' ? gems.merge(sim, p, c.item) : undefined;
        case 'satchel': return c.op === 'put' ? satchel.put(sim, p, c.item, c.x, c.y, c.r) : c.op === 'take' ? satchel.take(sim, p, c.i) : undefined;
        case 'skill': return economy.cmdSkill(sim, p, c.id);
        case 'xfer': return machines.cmdXfer(sim, p, c);
        case 'load': return machines.cmdLoad(sim, p, c.id);
        case 'collect': return machines.cmdCollect(sim, p, c.id);
        case 'config': return factory.cmdConfig(sim, p, c);
        case 'revive': return health.cmdRevive(sim, p, c.who);
        case 'dash': return cmdDash(sim, p, c);
        case 'wish': return wish.cmdWish(sim, p, c);
        case 'mail': return mail.cmdMail(sim, p, c);
        case 'potluck': return potluck.cmdPotluck(sim, p, c);
        case 'tame': return creatures.cmdTame(sim, p, c);
        case 'pet': return creatures.cmdPet(sim, p, c);
        case 'quest': return quests.cmdQuest(sim, p, c);
        case 'chat': return social.cmdChat(sim, p, c.text);
        case 'emote': return social.cmdEmote(sim, p, c.id);
        case 'ping': return social.cmdPing(sim, p, c.x, c.y);
        case 'travel': return shop.cmdTravel(sim, p, c.to);
        case 'shop': return shop.cmdShop(sim, p, c.i, c.n);
        case 'summon': return cmdSummon(sim, p, c.id, c.boss);
        case 'rift': return rift.cmd(sim, p, c);
        case 'breed': return creatures.cmdBreed(sim, p, c);
        case 'fish': return fishing.cmd(sim, p, c);
        case 'pat': return bond.cmdPat(sim, p);
        case 'towerpick': return defense.cmdPick(sim, p, c);
        case 'towerrepair': return defense.cmdRepair(sim, p, c);
    }
}

export function cmdMove (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'move' }>) {
    if (![c.x, c.y, c.fx, c.fy].every(Number.isFinite)) return;        // (the facing too: a NaN there would be sent to everyone)
    if (Math.hypot(c.x - p.x, c.y - p.y) > 64) { p.warp++; return; }   // too far: snap the client back
    if (sim.world.boxBlocked(c.x, c.y, 4, 3) && !sim.world.boxBlocked(p.x, p.y, 4, 3)) return;
    p.x = c.x;
    p.y = c.y;
    const f = Math.hypot(c.fx, c.fy) || 1;
    p.fx = c.fx / f;
    p.fy = c.fy / f;
    p.moving = !!c.moving;
}

/** The character creator: a look and a scarf colour, both made safe. */
export function cmdLook (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'look' }>) {
    const look = cleanLook(c.look);
    if (!look) return;
    p.look = look;
    p.color = cleanScarf(c.color);
    sim.fx('look', p.x, p.y - 8, p.id);
}

/** Down and tired of waiting for a friend: wake up at home now. (On an expedition you are out of the run, as when the clock runs out.) */
export function cmdRespawn (sim: Sim, p: PlayerS) {
    if (p.downed <= 0 || sim.windUp.has(p.id)) return;
    p.downed = 0;
    if (p.rift) { rift.eliminate(sim, p); return; }
    health.die(sim, p);
}

export function cmdSwing (sim: Sim, p: PlayerS, id: number) {
    const e = sim.s.ents[id];
    if (!e || p.swingCd > 0.05) return;
    const d = derived(p);
    const nest = e.k === 'node' && e.kind === 'nest';            // (a Blight nest is fought with your weapon: sim/blight.ts)
    const isMob = e.k === 'mob' || nest;
    const reach = (isMob ? Math.max(d.reach, d.weapon.reach) : d.reach) + 12;
    if (!sim.inReach(p, e, reach)) return;
    const isCrop = e.k === 'bld' && e.kind === 'bed' && e.crop === 2;
    if (e.k !== 'node' && !isMob && !isCrop) return;
    p.swingCd = d.swingCd * (isMob ? d.weapon.cd : 1);
    p.energy = Math.max(0, p.energy - (isMob ? combat.swingEnergy(p) : d.swingEnergy));
    const c = sim.center(e);
    sim.events.push({ e: 'swing', by: p.id, x: c.x, y: c.y, ...(isMob ? { w: d.weapon.wtype, px: p.x, py: hitPoint(p).y } : {}) });
    if (nest) blight.hitNest(sim, p, e);
    else if (e.k === 'node') gather.hitNode(sim, p, e);
    else if (e.k === 'mob') combat.attack(sim, p, e);
    else if (e.k === 'bld') machines.harvestBed(sim, p, e);
}

export function cmdDash (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'dash' }>) {
    if (!hasUnlock(p, 'dash') || (sim.dashT[p.id] ?? 0) > sim.s.time || p.energy < TUNING.dashEnergy) return;
    const l = Math.hypot(c.fx, c.fy);
    if (!(l > 0.1) || !Number.isFinite(l)) return;
    sim.dashT[p.id] = sim.s.time + TUNING.dashCooldown;
    p.energy -= TUNING.dashEnergy;
    // the dash only counts as what saved a farmer from the moment any protection they already had has run out (a hit taken a moment ago, a boon): see shielded()
    sim.perfectWin[p.id] = { from: sim.s.time + p.invuln, until: sim.s.time + TUNING.dashInvuln, cost: TUNING.dashEnergy, got: false };
    p.invuln = Math.max(p.invuln, TUNING.dashInvuln);
    sim.events.push({ e: 'knock', to: p.id, vx: (c.fx / l) * 300, vy: (c.fy / l) * 300 });
    sim.fx('dash', p.x, p.y - 6, p.id);
}

export function cmdSummon (sim: Sim, p: PlayerS, id: number, bossId: string) {
    const altar = sim.s.ents[id];
    if (altar?.k === 'bld') boss.summonBoss(sim, p, altar, bossId);
}
