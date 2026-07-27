// STUB — owned by the weapons/ballistics agent.
import { emit } from "../core/state.js";
export const WEAPONS = {
  rifle:{ id:"rifle", name:"MK-7 Carbine", mag:30, reserve:210, rpm:720, damage:26, zoom:1.35,
          spread:0.9, recoil:1, reload:2.1, mode:"auto", range:70 },
};
export function createWeapons(G){
  G.weapons.slots = [ Object.assign({ ammo:30, res:210, t:0, reloading:0 }, WEAPONS.rifle) ];
  G.weapons.active = 0;
  return G.weapons;
}
export function updateWeapons(G, dt){
  const w = G.weapons.slots[G.weapons.active];
  if (!w) return;
  const p = G.player;
  p.ads += ((G.input.buttons.has("ads") && !p.sprinting ? 1 : 0) - p.ads) * Math.min(1, dt*13);
  w.t -= dt;
  if (w.reloading > 0){ w.reloading -= dt; if (w.reloading <= 0){
    const need = w.mag - w.ammo, take = Math.min(need, w.res);
    w.ammo += take; w.res -= take; emit(G,"reload",{weapon:w.id,phase:"end"});
  } return; }
  if (G.input.pressed.has("reload") && w.ammo < w.mag && w.res > 0){
    w.reloading = w.reload; emit(G,"reload",{weapon:w.id,phase:"start"}); return;
  }
  if (G.input.buttons.has("fire") && w.t <= 0 && w.ammo > 0){
    w.t = 60/w.rpm; w.ammo--; G.stats.shots++;
    emit(G,"shot",{ weapon:w.id, origin:{...p.pos} });
    G.recoil.vPitch += 0.9; G.recoil.vKick += 6;
  }
  const k = 1 - Math.exp(-11*dt);
  G.recoil.pitch += G.recoil.vPitch*dt*0.06; G.recoil.vPitch *= (1-k);
  G.recoil.pitch *= (1 - Math.exp(-7*dt));
}
