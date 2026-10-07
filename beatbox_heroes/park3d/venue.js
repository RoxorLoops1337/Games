// VENUES for mg_rhythm (Stage and Club Artist INT-B).  buildVenue(ctx, name, opts) -> { name, group, update(dt, t, v), setEnergy(e), setBeat(pulse), setTheme(name), dispose(), anchors, cams, led, crowd, theme, hint, stats(), ...venue api }
//   names: 'bar' (open mic / karaoke, LED lyric wall), 'showcase' (gold stage, pyro, 30 spectators), 'booth' (practice room, ghost beat lines), 'arena' (battle: podiums, 5 judges, VS wall). 'busk' stays in mg_rhythm_world.
//   opts: { x: 0, z: -12.4 (stage centre in world coordinates; STAGE.z of mg_rhythm_world), stageH: 0.6, scale: 1 (arena: 1.6 to match the 1.75x performer), theme, crowd (count), seed, title, sub, programme ('karaoke'),
//           opp (Core.OPPONENTS entry | index | look), you (player name), q ('low'|'med'|'high' = ctx.quality), Core (defaults to window.BBH.Core) }
//
// HOW mg_rhythm.js PLUGS IT IN (mg_rhythm*.js belongs to MG-RHYTHM, so these lines are for them to add; nothing here edits it):
//   import { buildVenue } from './venue.js';
//   // 1. in createRhythm, where `const world = buildWorld(ctx, q); group.add(world.group);` is:
//   const venue = opts.venue && opts.venue !== 'busk' ? buildVenue(ctx, opts.venue, { z: STAGE.z, stageH: STAGE.h, theme: opts.theme, opp: opts.opp || (opts.battle && opts.battle.opp), you: opts.name, Core }) : null;
//   if (venue) group.add(venue.group); else group.add(world.group);          // the venue REPLACES the street world (skyline, trees, plaza are not needed indoors); the highway, fx and performer stay
//   // 2. lighting: the venue brings its own room, so build the lighting for an interior:  fake.interior = true; fake.profile = venue.hint.profile; fake.ceilY = venue.hint.ceilY; fake.anchors.rig = venue.anchors.rig;
//   //    fake.anchors.stageCenter = venue.anchors.stageCenter; after buildLighting:  lighting.setProfile(venue.hint.profile, true); lighting.setStageTheme(venue.theme, true);
//   // 3. per frame (next to world.update):  venue.update(dt, t, { energy: E, beat, spb: S.spb, approach: S.approach, flee: S.flee });   (the same object world.update gets, plus spb and approach for the booth ghost lines)
//   // 4. performer: perf.object.position.set(venue.anchors.performer.x + group.x, venue.anchors.performer.y, STAGE.z) is what it does today (performer = local origin); for 'arena' use venue.anchors.player (left podium) and call
//   //    venue.attachPlayer(perf) so it stands on the podium; venue.setOpponent(opts.opp) once per battle, venue.vs({ you, opp, round }) at every round start, venue.setScores([..5]) when the judges vote,
//   //    venue.cheer(1.5) on a win. Camera presets: venue.cams.<name> = { pos:[x,y,z], look:[x,y,z], fov } in world coordinates, feed them to S.camO = { p: pos, l: look, fov } (arena: wide, vs, oppClose, youClose, over, judges, crowd).
//   // 5. the venue brings its own crowd (instanced, in `venue.crowd`): skip buildCrowd(ctx, q, null) for venues, or pass opts.crowd: 0 and keep the street crowd (not advised).
//   // 6. LED wall: venue.setLyrics(lines) (bar), venue.setTitle(t, s) (bar/showcase), venue.splash(text, sub) (arena);  booth: venue.setGhost(bool). dispose: venue.dispose().
// Budgets (measured with world arena / the preview): bar <= 45k tris, showcase <= 60k, booth <= 25k, arena <= 90k (crowd and characters included); each venue <= 40 draw calls without characters.
import { beginVenue, finishVenue } from './venue_base.js';
import { buildVenueBar } from './venue_bar.js';
import { buildVenueShowcase } from './venue_showcase.js';
import { buildVenueBooth } from './venue_booth.js';
import { buildVenueArena } from './venue_arena.js';

export const VENUES = { bar: buildVenueBar, showcase: buildVenueShowcase, booth: buildVenueBooth, arena: buildVenueArena };
export const VENUE_NAMES = Object.keys(VENUES);
const DEFAULT_THEME = { bar: 'pink', showcase: 'gold', booth: 'cyan', arena: 'pink' };

export function buildVenue(ctx, name, opts) {
  const fn = VENUES[name]; if (!fn) throw new Error('unknown venue "' + name + '" (' + VENUE_NAMES.join(', ') + ')');
  opts = Object.assign({ theme: DEFAULT_THEME[name] }, opts || {}); if (opts.q === undefined) opts.q = (ctx && ctx.quality) || 'high'; if (name === 'arena' && opts.scale === undefined) opts.scale = 1;
  const V = beginVenue(ctx, name, opts), extras = fn(V) || {}; return finishVenue(V, extras);
}
