// Combat Arts: six active moves a farmer learns in the skill tree (Combat branch) and keeps on up to three keys.
//   hook: pulls the first monster in a line to you and stuns it a moment (a bit of Blitzcrank)
//   arrow: a long arrow that stuns whatever it meets, for longer the further it flew (a bit of Ashe)
//   scorch: a burst of fire round you that sets everything near alight
//   shroud: you slip out of sight; monsters lose you, and your next blow hits much harder
//   frost: a zone on the ground that freezes everything in it nearly solid for a few seconds
//   ram: a headbutt: you lunge forward and throw the first monster you hit, dazed (a bit of Alistar)
// Pure data: the sim (sim/arts.ts), the skill nodes (data/skills.ts), the HUD and the Arts screen read it.

export type ArtId = 'hook' | 'arrow' | 'scorch' | 'shroud' | 'frost' | 'ram';

export interface ArtDef {
    id: ArtId;
    name: string;
    icon: string;             // a `k_` glyph
    token: string;            // the unlock token its skill grants
    skill: string;            // the skill node that grants it
    cd: number;               // seconds before it can be used again
    energy: number;
    blurb: string;
    color: number;
}

export const ARTS: Record<ArtId, ArtDef> = {
    hook:   { id: 'hook',   name: 'Grapple Hook', icon: 'k_hook',  token: 'art_hook',   skill: 'c_hook',   cd: 9,  energy: 18, color: 0xf4deaa, blurb: 'Throw a hook in a line: the first monster is yanked to your feet and stunned.' },
    arrow:  { id: 'arrow',  name: 'Crystal Arrow', icon: 'k_arrow', token: 'art_arrow',  skill: 'c_arrow',  cd: 14, energy: 28, color: 0x8fdcf2, blurb: 'A long arrow. What it hits is stunned, longer the further the arrow flew.' },
    scorch: { id: 'scorch', name: 'Scorch',       icon: 'k_flame', token: 'art_scorch', skill: 'c_scorch', cd: 10, energy: 22, color: 0xf8a24a, blurb: 'A burst of fire round you: everything near is knocked back and burns.' },
    shroud: { id: 'shroud', name: 'Shroud',       icon: 'k_cloak', token: 'art_shroud', skill: 'c_shroud', cd: 18, energy: 18, color: 0x9d6fdb, blurb: 'Slip out of sight. Monsters lose you, and your next blow hits much harder.' },
    frost:  { id: 'frost',  name: 'Frost Zone',   icon: 'k_snow',  token: 'art_frost',  skill: 'c_frost',  cd: 16, energy: 26, color: 0xcdf4ee, blurb: 'A zone on the ground in front of you freezes everything in it nearly solid.' },
    ram:    { id: 'ram',    name: 'Headbutt',     icon: 'k_ram',   token: 'art_ram',    skill: 'c_ram',    cd: 11, energy: 22, color: 0xe85d62, blurb: 'Lunge forward and throw the first monster you meet, dazed.' },
};
export const ART_LIST: ArtDef[] = Object.values(ARTS);
export const isArt = (id: unknown): id is ArtId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ARTS, id);

/** The art keys, by position on the keyboard (so they are the same on every layout, and never clash with moving). */
export const ART_CODES = ['KeyZ', 'KeyX', 'KeyN'] as const;
export const ART_SLOTS = ART_CODES.length;

/** How the arts hit. Damage is the weapon's damage times `dmg`; distances are px (a tile is 16). */
export const ART_TUNING = {
    hook: { range: 112, width: 9, dmg: 1.2, stun: 0.9, gap: 14 },
    arrow: { range: 224, width: 7, dmg: 2, stunMin: 1.2, stunMax: 2.6 },
    scorch: { radius: 54, dmg: 0.8, burn: 1.2, burnSecs: 4, knock: 150 },
    shroud: { secs: 4, bonus: 1.6 },
    frost: { radius: 46, secs: 4, ahead: 56, slow: 0.12, dps: 0.2 },
    ram: { lunge: 60, width: 12, dmg: 1.5, stun: 1.2, throw: 130 },
} as const;
