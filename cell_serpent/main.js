import { keyAim, sliderAim, watchAim, resetAimSr, setFieldLabel } from './a11y_b12k.js';
import { beatPhase, quitResult, upgradeAllPets as upgradePetsAll, stageKind, isBossStage, skipPick, totalStars, stageMod, claimAllGoals, upgradeAllSkills, hatchAll, exportSave, importSave, keepCanUp, KEEPSAKES, FUND, fundReady, TROPHIES, trophyReady, dealsFor, welcomeReady, W, MAX_STAGE, KIND_LABEL, RING, RING_SCALE, useInvAttempt, invStage, INV_NAME, power, spendEnergy, tickEnergy, ENERGY_MAX, ENERGY_COST, buyEnergy, reviveGame, reviveCost, recPower, levelInfo, HARD_HP, PETS, PET_MAX_STAR, PET_SLOTS, petCost, petCanUp, petUp, togglePet, hatchEgg, buyEgg, EGG_PRICE, dayLogin, pigTier, usePigAttempt, PIG_NAME, RARITIES, LOADOUT_SIZE, toggleLoadout, dailyGoals, addRunStats, goalProgress, claimGoal, createGame, step, choose, reroll, botInput, buildPath, pointAt, stageInfo, canPlay, clearReward, META, WEAPONS, BOXES, SKILL_MAX_LV, metaCost, metaBuyable, skillUpgradeCost, buyMeta, unlockSkill, levelSkill, openBox, applyResult, defaultSave, sanitizeSave } from './sim.js';
import { platMeta } from './plat_b12d.js';
import { skinFor, recordAddictRun, eventInfo, ensureEvent } from './sim.js';
import { deathCauseOf } from './screen_b11.js';
import { createHub2 } from './hub2.js';
import { keepSnap, keepResult } from './keep_ui.js';
import { teaseGoal, hideTease } from './keep10.js';
import { loadArt } from './art.js';
import { createRenderer } from './render.js';
import { createArtDraw } from './art_draw.js';
import { createAudio } from './audio.js';
import { nextGoal, closeCall, renderGoal } from './result_goal.js';
import { flyPick } from './pickfly.js';
import { edgeMap } from './follow_b13c.js';
import { newAim, aimDown, aimMove, aimUp, aimTick, aimAssisted } from './aim_b12f.js';
import { levelUpJuice } from './juice_b13b.js';
import { dealGoals, applyMutator, showRunGoals, hideRunGoals, checkGoals, bumpStreak, resultChipHTML, renderHubStrip } from './goals_b16i.js';
import { bindMomentHaptics } from './audio_b14e.js';
import { revealStars, countUp, levelBar, reviveRing, stopFx, confetti, lossHint, progMeter } from './result_fx.js';
import { applyCbPalette, paintCbStrip, applyCbRarity } from './cb_palette.js';
import { textScaleOf, textScaleLabel, initGridNav, initSrPass } from './access.js';
import { initA11y7 } from './a11y7.js';
import { labelButtons, applyPageSettings, systemReduceMotion, initSlider, showSlider, initKeys, pauseAllowed, announce, watchGroove, watchStreak, resetGroove, showZone, inThumbZone, zoneSteer, initKeyboard, RARITY_WORDS } from './access.js';
import { createMotion } from './motion.js';
import { curtainOpen, curtainClose, onCurtain } from './curtain_ui.js';
import { celebrateBest, stopBest } from './best_fx.js';
import { createClock } from './clock.js';
import { setupPeeks, titleInfoHTML } from './title_fx.js';
import { setupTune, wantsHand } from './title_b8.js';
import { setupSecrets } from './title_b9.js';
import { setupTitle10 } from './title_b10.js';
import { setupTitle11 } from './title_b11.js';
import { deathCoach } from './coach_b11.js';
import { firstGoalHTML, welcomeBack, welcomeHTML, hoursAway, stampVisit } from './title12b.js';
import { bakeCardArt } from './card_bake.js';
import { partnerIds, markPartners, betterRoll, luckHTML, refreshPips, buildHTML, passiveStat, bandSheetHTML, revealHTML, cardMeter, ghostBarHTML, levelRingHTML, skipHTML, foilHTML, tickBand, cardFoilHTML, markReroll, chainPulse, hudBottomPx, guardAllows, trackPress, armCards } from './cards_ui.js';
import { offeredLinks, markLinks, lockState, lockHTML, toggleLock, keepLocked, dealChipHTML, pickBurst, lockKey } from './cards_b10.js';
import { capIconURL, kindLabel, synergyHint } from './card_icons.js';
import { plainDesc, dpsNote } from './cards_plain_b15.js';
import { paintTabIcons, bindHubSwipe, setTabCount, onTabUp } from './tabs_ui.js';
import { paintButtonGlyphs, RECAP, emptyCard } from './btn_glyphs.js';
import { paintSettingIcons } from './icons_b8.js';
import { watchGlyphs } from './glyph_sweep.js';
import { dressToast } from './toast_ui.js';
import { haptic, TONE_HAPTIC } from './haptics_b12l.js';
import { readyNudge } from './badges_b11.js';
import { flashDone } from './btn_state.js';
import { watchSideIcons, sideIconURL, SIDE_ICON_NAMES } from './side_icons.js';
import { warmIdle } from './icon_warm_b11.js';
import { setupTitleSnake, needsFirstPop, firstPop } from './onboard5.js';
import { renderRecStrip, recFor, bestBuild } from './build_rec.js';
import { petLabel } from './pet_names.js';
import { emptyCard as emptyCardUx } from './empty_ux.js';
import { richDemo, setupTapAnimals, tagPets, setupTitleLife, playBurst, needsTutorial, showTutorial, petHint, eggNudge } from './onboard12.js';
import { momentLine } from './hit_juice8.js';
import { bringHTML, twistHTML, factHTML, eventBannerHTML, monthEndMs, countdownText, syncDock, watchDock, fitTitle, bindStageNav, goTag, chipReward, goalRowHTML, watchSide, starsHTML, claimInfo, eventReadyCount, claimChips, fanRects, powerHTML, powerGap, bestTag, worldStrip, portraitSpring } from './battle_ui.js';
import { actStripHTML, actTarget, gapFix, gapFixHTML, openOverview } from './battle_b11.js';
import { createSheets, chipRow, hatchBurst, skillRank, petRarity, PET_RARITY, isNewItem, newRibbonHTML } from './skill_sheet.js';
import { swapSheet, rarityChip } from './loadout_ux.js';
import { fitTags, collectionHTML, hatchRays } from './skillpets8.js';
import { hatchTag } from './pets_b10.js';
import { tileA11y, skillTileLabel, petTileLabel, masteryMark, petOnTile, collectionCelebrate, joyBadge } from './pets_b9.js';
import { collectFly, hardLevel, snap } from './gig_fx.js';
import { BOW, paintRibbonChip, holdRibbons, releaseRibbons, flyRibbons, momentEvent, bestMoment, showMoment } from './result_b8.js';
import { pauseBuild, buildChipHTML, buildLine, pauseSub } from './result_b9.js';
import { foldTab, foldSettings, hook as foldHook } from './fold_b12r.js';
import { bindSettingsFind, hubStickerPop, markStickersSeen, reviveInfoHTML, shareText, shareResult } from './result_b11.js';
import { bindBuildChips, chipStatsText, stickerIds, newStickers, showStickerPop, clearStickerPop, bumpStatsTab, shineStars } from './result_b10.js';
import { rewardSnaps, retryFly, lossLine, holdConfirm, trackModality } from './result_ux.js';
import { renderPresets, enableDrag, joyHTML } from './presets_ux.js';
import { dressDuo, wornOutfit } from './duo_pose.js';
import { PUMP_LEVELS, pumpLevel } from './audio_pump.js';
import { createCues, wantsMuffle, sheetSound } from './audio_cues.js';
import { panOf, sweepTick, isMilestone } from './audio_b12i.js';
import { logRun } from './hub_b11.js';
import { initFullscreen, fsOnRun } from './fullscreen_fs.js';
import { initInstall } from './install_b12n.js';
import { isUnlocked, isTabUnlocked, setUnlockAll, unlockAllOn } from './unlock_b12p.js';
import { createUnlockUI, trimGoalsPanel } from './unlock_ui_b12p.js';

try { if (/[?&]unlock=all\b/.test(location.search)) setUnlockAll(true); } catch (e) { /* ignore */ }   // b12p: test/debug only, opens every tab and panel
const SAVE_KEY = 'cell_serpent_save_v1';   // never rename: it is the live save slot (the save itself is versioned inside)
const $ = id => document.getElementById(id);
const canvas = $('c');
let save = defaultSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

const audio = createAudio(), cues = createCues(audio);
bindMomentHaptics(audio, () => save && save.settings);   // b14e: unlock, stat buy, level-up and result motif also buzz
audio.setMuted(save.muted); audio.setMusicAllowed(save.settings.music); audio.setVolume(save.settings.volume);
let stagKey = '';   // which hub tab already played its entrance
const motion = createMotion({ $, buzz: p => buzz(p), getReduced: () => !!(save && save.settings && save.settings.reduceMotion) }); motion.init();
const buzz = p => { try { if (save.settings.vibrate && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };
function applySettings() { motion.applyReduced(); audio.setMuted(save.muted); audio.setMusicAllowed(save.settings.music); audio.setVolume(save.settings.volume); audio.setBeatTick(save.settings.beatTick); audio.setPump(save.settings.pump); if (R) R.setOptions({ reduceFlash: !!save.settings.reduceFlash, reduceMotion: save.settings.reduceMotion || systemReduceMotion(), lowQuality: !!save.settings.lowQuality || autoLow, bigNumbers: save.settings.bigNumbers, colorBlind: save.settings.colorBlind, highContrast: save.settings.highContrast, leftHand: !!save.settings.leftHand, textScale: textScaleOf(save.settings) }); applyPageSettings(save.settings); applyCbPalette(kit, !!save.settings.colorBlind); applyCbRarity(RARITIES, !!save.settings.colorBlind); showSlider(save.settings.slider && mode === 'play' && !document.querySelector('.scr.on')); showZone(save.settings.thumbZone && mode === 'play' && !document.querySelector('.scr.on')); dprCap = save.settings.lowQuality ? 1 : Math.max(dprCap, 2); }
let art = null, R = null, kit = null;
// perf b15: an automatic low quality tier. The JS cost of drawing a frame is measured (a moving average of R.draw milliseconds); a phone that spends more than about 9 ms
// of every 16 on drawing alone gets the lighter effects at once (half the particles, backgrounds and hit juice), and gets the full show back after a quiet stretch.
// The saved Low quality setting is untouched; this tier lives for the session only.
let autoLow = false, drawMs = 3, drawCalm = 0, drawHot = 0, autoFlips = 0;
function governDraw(ms) {
  drawMs += (ms - drawMs) * 0.06;
  if (!autoLow) {
    if (drawMs > 9) drawHot++; else drawHot = Math.max(0, drawHot - 2);
    if (drawHot > 50 && !save.settings.lowQuality) { autoLow = true; autoFlips++; drawHot = 0; drawCalm = 0; if (R) R.setOptions({ lowQuality: true }); }
  } else if (autoFlips < 3) {   // after three flips the tier stays for the session: no flicker between two looks
    if (drawMs < 4.2) drawCalm++; else drawCalm = Math.max(0, drawCalm - 3);
    if (drawCalm > 1200) { autoLow = false; drawCalm = 0; drawHot = 0; if (R) R.setOptions({ lowQuality: !!save.settings.lowQuality }); }
  }
}
const dayKey = () => Math.floor(Date.now() / 86400000);
let slowFrames = 0, fastFrames = 0;
const clk = createClock();   // 05-screen-feel: fixed-step clock fed with dt * slow-motion scale
let reviveAsked = false, hard = false, mode = 'title', g = null, demo = null, acc = 0, last = 0, endT = 0, cardsFor = null, hubTab = 'Battle', sel = 1, ranResult = false;
const joy = { on: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const fol = { on: false, id: -1, x: 0, ptT: 0, keyT: 0 };   // b12s: follow-finger control (lane stages): the first finger owns movement, the duo chases its x
const MOVE_KEYS = new Set(['a', 'd', 'arrowleft', 'arrowright']);
const followMode = () => !!g && !g.ring && save.settings.controlStyle !== 'joystick';
const folX = x => g && g.p ? edgeMap(x, g.p.zone.x0, g.p.zone.x1, !!save.settings.leftHand) : x;   // b13c: the outer strip of the screen reaches the lane wall
const keys = {};
  const aimS = newAim();   // b11: circle stages aim all round: the finger or mouse sets the target angle, the sim gets an eased angle
  const aimTk = {};
const AIM_HINT_KEY = 'cell_serpent_aimhint_b11';
const aimHintLeft = () => { try { return +(localStorage.getItem(AIM_HINT_KEY) || 0) < 3; } catch (e) { return true; } };
const aimHintBump = () => { try { localStorage.setItem(AIM_HINT_KEY, String(+(localStorage.getItem(AIM_HINT_KEY) || 0) + 1)); } catch (e) { /* ignore */ } };
let aimHint = false;
function aimAt(e, down) {   // b12f: a touch at the arena aims at it, a touch anywhere else (thumb zone) is a floating stick (aim_b12f.js)
  if (!g || !g.ring) return;
  const dpr = canvas.width / innerWidth, gp = R.toGame(e.clientX * dpr, e.clientY * dpr), mouse = e.pointerType === 'mouse';
  if (down) { aimHint = false; if (aimS.mode && !mouse) return; aimDown(aimS, gp.x, gp.y, g.p.x, g.p.y, RING.R, e.pointerId); if (mouse) aimS.mode = 1; }
  else { aimMove(aimS, gp.x, gp.y, g.p.x, g.p.y); if (aimS.mode === 2) { joy.x = aimS.ax; joy.y = aimS.ay; joy.dx = (gp.x - aimS.ax) / 120; joy.dy = (gp.y - aimS.ay) / 120; } }
}
sel = Math.max(1, save.last.stage); hard = save.last.hard;

let dprCap = 2;   // lowered automatically on slow phones (dynamic resolution)
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize); resize(); initFullscreen(() => save.settings.fullscreen !== false); initInstall();
initSlider(joy, () => mode === 'play', () => { if (g && g.encore >= 1) encoreTap = true; }); initKeyboard(); initSrPass(); initA11y7(); initGridNav(document.getElementById('tabBattle')); labelButtons(); new MutationObserver(() => labelButtons()).observe(document.body, { childList: true, subtree: true });

let shownId = '';
function show(id) { if (id !== 'hub') unlockUI.dropCard(); { const ss = sheetSound(shownId, id); shownId = id; if (ss) audio.play(ss); } if (id !== 'title') armBack(); motion.screen(id); if (id !== 'hub') stagKey = ''; $('muteBtn').classList.toggle('on', id === 'title' || id === 'pause'); showSlider(save.settings.slider && mode === 'play' && !id); showZone(save.settings.thumbZone && mode === 'play' && !id && !(g && g.ring)); }
// the gig claim holds the pill at its old value until the flying rewards land (then it counts up with a +N)
const curHold = {};
function gigFlies(list, d0 = 0) {
  const reduce = !!(save.settings.reduceMotion || systemReduceMotion()), left = { beats: 0, sparkles: 0 }, sum = { beats: 0, sparkles: 0 };
  for (const it of list) { left[it.kind]++; sum[it.kind] += it.amt; }
  for (const k of ['beats', 'sparkles']) if (left[k]) curHold[k] = Math.max(0, save[k] - sum[k]);
  const rel = () => { delete curHold.beats; delete curHold.sparkles; refreshCur(); };
  list.forEach((it, i) => setTimeout(() => { audio.play('ribbonfly', { i }); collectFly(it.snap, it.kind, { reduce, onLand: () => { audio.play('ribbonland', { i }); if (curHold[it.kind] === undefined) return; curHold[it.kind] += it.amt; if (!--left[it.kind]) delete curHold[it.kind]; refreshCur(); } }); }, d0 + i * 160));
  setTimeout(rel, d0 + 700 + list.length * 160 + 1200);   // safety: never leave a pill stuck
}
function refreshCur() { for (const [id, v] of [['tBeats', save.beats], ['hBeats', save.beats], ['tSpark', save.sparkles], ['hSpark', save.sparkles]]) { const hv = curHold[id.endsWith('Beats') ? 'beats' : 'sparkles']; motion.num($(id), hv === undefined ? v : hv); } const pw = $('hPower'); if (pw) { const li = levelInfo(save.xp); pw.textContent = 'Lv ' + li.lv + '  ·  Power ' + power(save) + (save.streak.n > 1 ? '  ·  🔥 ' + save.streak.n : ''); } { const ht = document.querySelector('.hubtop'), big = Math.max(save.beats, save.sparkles); if (ht) { ht.classList.toggle('big', big >= 10000); ht.classList.toggle('huge', big >= 100000); } }   // long numbers shrink the header pills on narrow phones
  paintRibbonChip(save.ribbons);
  const en = $('hEnergy'); if (en) en.textContent = tickEnergy(save, Date.now()) + '/' + ENERGY_MAX; }

// ---------------------------------------------------------------- icons (all drawn by the art kit)
const iconCache = {};
const WICON = { daggers: 'dagger', needles: 'needle' };
function iconURL(id) {
  if (id in iconCache) return iconCache[id];
  { const cu = capIconURL(id); if (cu) return (iconCache[id] = cu); }
  let spr = null;
  if (kit) {
    if (['aspd', 'notes', 'burst', 'cdmg'].includes(id)) spr = kit.SPR.note(id === 'cdmg');
    else if (id === 'beats') spr = kit.SPR.pickup('coin');
    else if (id === 'sparkles') spr = kit.SPR.pickup('spark');
    else if (id === 'boxbeat' || id === 'boxspark' || id === 'chest') spr = kit.SPR.pickup(id);
    else if (id === 'egg') spr = kit.SPR.pickup('egg');
    else if (PETS.some(p => p.id === id)) spr = kit.SPR.pet(id);
    else if (WEAPONS.some(w => w.id === id)) spr = kit.SPR.weapon(WICON[id] || id);
  }
  return (iconCache[id] = spr && spr.c.toDataURL ? spr.c.toDataURL() : '');
}
const PICON = { enc: '👏', power: '🎤', haste: '⏱️', crit: '🎯', vital: '❤️', guard: '🎧', speed: '👟', dbeat: '🥁', fork: '🎼', gear: '👂' };
const icon = id => (PICON[id] ? PICON[id] : PETS.some(p => p.id === id) ? (iconURL(id) ? `<img src="${iconURL(id)}" alt="">` : '🐾') : id === 'egg' ? (iconURL('egg') ? `<img src="${iconURL('egg')}" alt="">` : '🥚') : iconURL(id) ? `<img ${WEAPONS.some(w => w.id === id) || id === 'maw' ? 'class="zoom" ' : ''}src="${iconURL(id)}" alt="">` : (id[0] || '?').toUpperCase());
const STATICON = { atk: '🔊', crt: '🎵', cdn: '⏱️', vit: '❤️', for: '⭐', rev: '🎤' };
function tile({ cls = '', ic, name, chip, chipCls = '', desc, bar, barText, pips, btn, gold, disabled, onclick, one, lock }) {
  const t = document.createElement('div'); t.className = 'tile ' + cls + (one ? ' one' : '');
  t.innerHTML = `<div class="top"><div class="ic">${ic}${lock ? `<b class="lk">🔒${lock === true ? '' : `<small>${lock}</small>`}</b>` : ''}</div><div style="min-width:0"><div class="nm">${name}</div>${chip ? `<span class="lv ${chipCls}">${chip}</span>` : ''}</div></div>` +
    `<div class="ds">${desc}</div>` + (bar !== undefined ? `<div class="bar"><i style="width:${bar}%"></i></div><div class="sm">${barText || ''}</div>` : '') + (pips ? `<div class="pips">${pips}</div>` : '') +
    (btn ? `<button class="btn small go ${gold ? 'gold' : ''}" ${disabled ? 'disabled' : ''}>${btn}</button>` : '');
  const b = t.querySelector('button'); if (b && onclick) b.onclick = onclick;
  return t;
}
function loadoutRow(el, link) {
  el.innerHTML = '';
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const id = save.loadout[i], w = id && WEAPONS.find(x => x.id === id), b = document.createElement('button'); b.className = 'slot' + (id ? ' full tier' + (w ? w.tier || 0 : 0) : '');
    b.innerHTML = id ? icon(id) + (w && save.skills[id] ? `<em class="slv">${save.skills[id].lv}</em>` : '') : '+';
    if (id && !link) b.title = 'Tap to remove';
    b.setAttribute('aria-label', id ? `Slot ${i + 1}: ${w ? w.name : id}${w && save.skills[id] ? ', level ' + save.skills[id].lv : ''}${link ? '. Opens Skills' : '. Press to remove'}` : `Slot ${i + 1}: empty${link ? '. Opens Skills' : ''}`);
    b.onclick = () => { audio.play('click'); if (link) { hubTab = 'Skills'; renderHub(); } else if (id && toggleLoadout(save, id)) { persist(); renderHub(); } };
    el.appendChild(b);
  }
  fitTags(el, save, !link);
}
const curImg = c => `<img src="${iconURL(c)}" alt="" style="width:22px;height:22px;vertical-align:middle">`;
const skillLevels = () => Object.fromEntries(Object.entries(save.skills).map(([id, k]) => [id, k.lv]));

// ---------------------------------------------------------------- hub
const TABS = ['Shop', 'Stats', 'Battle', 'Skills', 'Pets', 'Gear'];
const OPEN_TABS = [...TABS];   // b12p: the tabs that are open right now (unlock_ui keeps it in step with save.cleared)
const unlockUI = createUnlockUI({ order: OPEN_TABS, save: () => save, persist: () => persist(), audio, toast: m => toast(m), mode: () => mode, shown: () => shownId, tab: () => hubTab });
// round 11: one kind line when a reward is waiting, once per thing per visit (never over a panel or the welcome gift)
const nudged = new Set();
function hubNudge() {
  try { if (!isUnlocked('nextreward', save)) return; const n = readyNudge(save, dayKey(), Date.now(), nudged); if (!n) return; nudged.add(n.key); setTimeout(() => { const nr = document.getElementById('nextRew'); if (nr && nr.classList.contains('ready')) return; /* the Next Reward banner already says it, and the toast would cover the currency pills */ if (mode === 'hub' && shownId === 'hub') toast(n.icon + ' ' + n.text + '!'); }, 900); } catch (e) { /* ignore */ }
}
function openHub(tab = hubTab) {
  mode = 'hub'; hubTab = isTabUnlocked(tab, save) ? tab : 'Battle'; audio.hubWorld(skinFor(sel)); audio.music(false); audio.hub(true);
  if (dayLogin(save, dayKey())) persist();
  refreshCur();
  sel = Math.max(1, Math.min(sel, MAX_STAGE, save.cleared + 4));
  renderHub(); show('hub'); if (!hub2.addict.maybeComeback()) { if (!hub2.retain.checkAch()) hubNudge(); }
  try { hubStickerPop(save, { reduce: !!(save.settings.reduceMotion || systemReduceMotion()), valid: () => mode === 'hub' }); } catch (e) { /* cosmetic */ }
}
function badgeTabs() {
  const day = dayKey(), s = save, out = new Set();
  if (welcomeReady(s) || dealsFor(s, day).some((d, i) => !s.shop.bought[i] && d.price === 0) || s.shop.gold !== day) out.add('Shop');
  if (META.some(d => metaBuyable(s, d) && s.beats >= metaCost(d, s.meta[d.id] || 0))) out.add('Stats');
  if ((isUnlocked('sign', s) && s.sign.day !== day) || (isUnlocked('fund', s) && FUND.some(f => fundReady(s, f))) || (isUnlocked('trophies', s) && TROPHIES.some(t => trophyReady(s, t))) || (isUnlocked('gigs', s) && dailyGoals(day).some(gl => goalProgress(s, day, gl) >= gl.target && !(s.daily.day === day && s.daily.claimed[gl.id])))) out.add('Battle');
  if (WEAPONS.some(w => { const k = s.skills[w.id]; return k.lv > 0 ? k.lv < SKILL_MAX_LV && k.frag >= skillUpgradeCost(k.lv).frag : k.frag >= w.frag && (s.cleared || 0) >= (w.stage || 0); })) out.add('Skills');
  if (s.eggs > 0 || PETS.some(p => petCanUp(s, p.id))) out.add('Pets');
  if (KEEPSAKES.some(k => keepCanUp(s, k.id))) out.add('Gear');
  return out;
}
// round 10: how many things are ready per tab (the tab badge shows the number)
function badgeCounts() {
  const day = dayKey(), s = save, m = new Map(), put = (t, n) => { if (n > 0) m.set(t, n); };
  put('Shop', (welcomeReady(s) ? 1 : 0) + dealsFor(s, day).filter((d, i) => !s.shop.bought[i] && d.price === 0).length + (s.shop.gold !== day ? 1 : 0));
  put('Stats', META.filter(d => metaBuyable(s, d) && s.beats >= metaCost(d, s.meta[d.id] || 0)).length);
  put('Battle', (isUnlocked('sign', s) && s.sign.day !== day ? 1 : 0) + (isUnlocked('fund', s) ? FUND.filter(f => fundReady(s, f)).length : 0) + (isUnlocked('trophies', s) ? TROPHIES.filter(t => trophyReady(s, t)).length : 0) + (!isUnlocked('gigs', s) ? [] : dailyGoals(day)).filter(gl => goalProgress(s, day, gl) >= gl.target && !(s.daily.day === day && s.daily.claimed[gl.id])).length);
  put('Skills', WEAPONS.filter(w => { const k = s.skills[w.id]; return k.lv > 0 ? k.lv < SKILL_MAX_LV && k.frag >= skillUpgradeCost(k.lv).frag : k.frag >= w.frag && (s.cleared || 0) >= (w.stage || 0); }).length);
  put('Pets', (s.eggs > 0 ? 1 : 0) + PETS.filter(p => petCanUp(s, p.id)).length);
  put('Gear', KEEPSAKES.filter(k => keepCanUp(s, k.id)).length);
  return m;
}
function renderHub() {
  if (!isTabUnlocked(hubTab, save)) hubTab = 'Battle';
  refreshCur(); try { dressDuo(document.querySelector('.herobox .duo'), { outfit: wornOutfit(save) }); } catch (e) { /* ignore */ }
  { const bd = badgeTabs(), bc = badgeCounts(); for (const b of document.querySelectorAll('.tabs button')) { const has = b.querySelector('.dot'); if (bd.has(b.dataset.tab) && !has) { const d = document.createElement('i'); d.className = 'dot'; b.appendChild(d); } else if (!bd.has(b.dataset.tab) && has) has.remove(); setTabCount(b, bc.get(b.dataset.tab) || 0); } }
  hub2.addict.renderNext(); hub2.retain.renderStrip(); petHint(document.querySelector('.tabs'), hubTab, save);
  motion.tabDir(OPEN_TABS, hubTab);
  for (const t of TABS) { $('tab' + t).classList.toggle('on', t === hubTab); }
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === hubTab);
  $('hub').classList.toggle('bt-on', hubTab === 'Battle');
  if (hubTab === 'Battle') renderBattle(); else if (hubTab === 'Skills') renderSkills(); else if (hubTab === 'Pets') renderPets(); else if (hubTab === 'Stats') hub2.renderStats(); else if (hubTab === 'Gear') hub2.renderGear(); else hub2.renderShop();
  if (stagKey !== hubTab) { stagKey = hubTab; if (hubTab !== 'Battle') motion.stagger($('tab' + hubTab)); }
  unlockUI.apply(save);   // b12p: hide what is still locked, lay out the tab bar, run the hint queue
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { audio.unlock(); audio.play('click'); hubTab = b.dataset.tab; hubTabSwitch(); };
paintTabIcons(); paintButtonGlyphs(); paintSettingIcons(); watchGlyphs(document.body);
bindHubSwipe({ order: OPEN_TABS, cur: () => hubTab, hub: $('hub'), pane: () => $('tab' + hubTab), bump: () => buzz(10), go: t => { if (mode !== 'hub') return; audio.unlock(); audio.play('click'); buzz(6); hubTab = t; hubTabSwitch(); } });
// 17-perf: a tab tap paints the new pane at once (old content dimmed as a light skeleton) and builds it on the next frame, so the tap never freezes
let hubSwitchTok = 0;
function hubTabSwitch() {
  const tok = ++hubSwitchTok, hb = $('hub');
  for (const x of document.querySelectorAll('.tabs button')) x.classList.toggle('on', x.dataset.tab === hubTab);
  for (const t of TABS) $('tab' + t).classList.toggle('on', t === hubTab);
  hb.classList.add('hub-skel');
  const go = () => { if (tok !== hubSwitchTok) return; hb.classList.remove('hub-skel'); renderHub(); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0)); else go();
}

function renderBattle() {
  const info = stageInfo(sel), playable = canPlay(save, sel), done = sel <= save.cleared;
  const sp = (kit && kit.SPECIES && kit.SPECIES[info.skin]) || null;
  { const hero = $('btHero'); hero.style.setProperty('--hc', sp ? sp.base : '#6a5cc0'); hero.style.setProperty('--hg', sp ? sp.sh + 'aa' : '#3a2d80'); }
  $('stTitle').textContent = info.name;
  $('stSub').textContent = `Stage ${sel}  ·  ${info.path}`;
  $('stBadges').innerHTML = (info.boss ? '<i class="boss">👑 BOSS</i>' : '') + (info.kind === 'ring' ? '<i class="ring">🌀 CIRCLE</i><i class="ring aim">DRAG TO AIM</i>' : '') + (info.kind === 'double' ? '<i class="dbl">🐍🐍 DOUBLE</i>' : '') + (hard ? '<i>HARD</i>' : '');
  $('stPrev').disabled = sel <= 1; $('stNext').disabled = sel >= Math.min(MAX_STAGE, save.cleared + 4);
  const chips = $('stChips'), chipTop = Math.min(MAX_STAGE, save.cleared + 4);
  let ckey = save.cleared + '|' + chipTop + '|' + (save.hardCleared || 0); for (let n = 1; n <= chipTop; n++) ckey += (save.stars[n] || 0);
  const chipsSame = chips.dataset.k === ckey && chips.children.length === chipTop;   // 17-perf: the 54 chips are rebuilt only when stars or progress changed
  if (chipsSame) for (let n = 1; n <= chipTop; n++) chips.children[n - 1].classList.toggle('sel', n === sel);
  else { chips.innerHTML = ''; chips.dataset.k = ckey; }
  for (let n = 1; n <= chipTop && !chipsSame; n++) {
    const c = document.createElement('button'); c.className = 'chip' + (n === sel ? ' sel' : '') + (n > save.cleared + 1 ? ' lock' : '') + (n <= save.cleared ? ' done' : '') + (n === save.cleared + 1 ? ' nxt' : '');
    { const stN = save.stars[n] || 0, kd = stageKind(n); if (stN >= 3 && n <= save.cleared) c.classList.add('perfect'); c.innerHTML = n > save.cleared + 1 ? '🔒' : `${n}<span class="st${n > save.cleared ? ' no' : ''}">${[1, 2, 3].map(q => q <= stN ? '<u>★</u>' : '★').join('')}</span>` + (isBossStage(n) ? '<span class="kk">👑</span>' : kd === 'ring' ? '<span class="kk">🌀</span>' : kd === 'double' ? '<span class="kk">🐍</span>' : '') + chipReward(n, save.cleared, save.hardCleared); if (n === save.cleared + 1 || hardLevel(n, save.cleared, save.hardCleared) !== 'none') c.classList.add('hasrw'); if (hardLevel(n, save.cleared, save.hardCleared) !== 'none') c.classList.add('hasH'); }
    c.onclick = () => { audio.play('click'); sel = n; renderBattle(); };
    chips.appendChild(c);
  }
  if (sel > save.cleared) hard = false;
  const hardOk = sel <= save.cleared;
  { const rp = recPower(sel, hard), mine = power(save);
    $('diffRow').innerHTML = `<div class="seg ${hard ? 'h' : ''}"><i></i><button class="dbtn ${hard ? '' : 'on'}" data-h="0">Normal</button><button class="dbtn hard ${hard ? 'on' : ''}" data-h="1" ${hardOk ? '' : 'disabled'}>${hardOk ? 'Hard' : '🔒 Hard'}</button></div>${powerHTML(mine, rp, hard)}`; }
  for (const b of $('diffRow').querySelectorAll('.dbtn')) b.onclick = () => { audio.play('click'); hard = b.dataset.h === '1'; renderBattle(); };
  { const gf = $('gapFix'), gap = powerGap(power(save), recPower(sel, hard)).gap, fx = (f0 => (f0 && isTabUnlocked(f0.tab, save) ? f0 : null))(gapFix(gap, badgeCounts())); gf.hidden = !fx; gf.dataset.tab = fx ? fx.tab : ''; gf.innerHTML = gapFixHTML(fx, gap); }   // b11: one tap to what closes the power gap
  $('stMod').innerHTML = twistHTML(info.mod); $('btFact').hidden = true; $('btHero').classList.remove('fact');
  { const nxt = Math.min(MAX_STAGE, save.cleared + 1), cb = $('contBtn'); cb.style.display = sel === nxt || save.cleared >= MAX_STAGE ? 'none' : ''; syncRwFilter(chips, cb); cb.textContent = 'CONTINUE ▶ ' + nxt; cb.onclick = () => { audio.play('click'); sel = nxt; hard = false; renderBattle(); }; }
  const first = !done ? `<span>First clear <b>${curImg('sparkles')} ${clearReward(sel).sparkles}</b></span>` : `<span><b>Cleared ✓</b> ${starsHTML(save.stars[sel] || 0)}</span>${sel > (save.hardCleared || 0) ? `<span class="hardpay">Hard pays <b>${curImg('sparkles')} ${Math.round(clearReward(sel).sparkles * 1.5)}</b></span>` : ''}`;
  $('stInfo').innerHTML = `<span>Cells <b>${info.length}</b>  ·  HP <b>${(h => (h >= 1000 ? (h / 1000).toFixed(1) + 'k' : h))(Math.round(info.hp * (hard ? HARD_HP : 1)))}</b></span>${first}`;
  const go = $('stGo'); go.disabled = !playable; go.textContent = playable ? 'START  ⚡' + ENERGY_COST : `CLEAR STAGE ${save.cleared + 1} FIRST`;
  $('btHint').textContent = !save.cleared && !save.runs ? 'Slide to line up. You shoot by yourself. Pop every cell, then the face, before it reaches the pink line!' : (playable && save.energy && tickEnergy(save, Date.now()) < ENERGY_COST ? 'Out of Voice! Tap + up top, or rest a bit.' : '');
  loadoutRow($('battleLoad'), true);
  { const pr = save.prog[(hard ? 'h' : '') + sel] || 0; bestPct = pr; $('stProg').innerHTML = `<div class="pgl${pr ? ' has' : ''}">Best <b>${pr}%</b>${bestTag(hard, powerGap(power(save), recPower(sel, hard)).gap)}</div><div class="pgr"><i style="width:${pr}%"></i>${[25, 50, 100].map(t => `<span class="${pr >= t ? 'got' : ''}" style="left:${t}%">${icon('chest')}</span>`).join('')}</div>`; }
  { const ws = $('wStrip'), wk = save.cleared + '|' + sel; if (ws && ws.dataset.k !== wk) { ws.dataset.k = wk; ws.innerHTML = actStripHTML(save.cleared, sel, MAX_STAGE, isBossStage, Math.min(MAX_STAGE, save.cleared + 4)); } }   // b11: five named worlds over the 50 ticks (worldStrip draws the ticks)   // r10: 50 ticks, boss crowns taller
  hub2.renderSide(); watchSideIcons($('battleSide')); watchSide($('battleSide'));
  renderPig();
  syncDock(); watchDock(); fitTitle($('stTitle')); goTag($('stGo'), power(save), recPower(sel, hard), playable);
  renderGoals(); try { if (isUnlocked('sessgoals', save)) renderHubStrip(save, dayKey(), document.querySelector('.gl-box'), isUnlocked('weekmut', save)); } catch (e) { /* ignore */ } foldTab('Battle');
  if (chips.dataset.sc !== sel + '|' + ckey) { chips.dataset.sc = sel + '|' + ckey; requestAnimationFrame(() => { const chip = chips.querySelector('.sel'); if (chip) { try { chips.scrollTo({ left: chip.offsetLeft - (chips.clientWidth - chip.offsetWidth) / 2, behavior: 'smooth' }); } catch (e) { /* ignore */ } } }); }   // 17-perf: read layout after paint, and only when the stage changed
}
// chip filter: only the stages that still pay something (next first clear, unpaid Hard clear)
let rwMode = 0;   // 0 all stages, 1 stages that still pay, 2 only the unpaid Hard clears
function syncRwFilter(chips, cb) {
  const row = $('btRowH'), n = chips.querySelectorAll('.chip.hasrw').length, nh = chips.querySelectorAll('.chip.hasH').length; let f = $('rwFilter');
  if (!f) { f = document.createElement('button'); f.id = 'rwFilter'; f.className = 'pill rwf'; f.onclick = () => { audio.play('click'); const hn = $('stChips').querySelectorAll('.chip.hasH').length; rwMode = rwMode === 0 ? 1 : rwMode === 1 && hn ? 2 : 0; renderBattle(); }; row.insertBefore(f, cb); }
  if (!n) rwMode = 0; if (rwMode === 2 && !nh) rwMode = 0;
  f.hidden = !n; f.classList.toggle('on', rwMode > 0); f.classList.toggle('hard', rwMode === 2); f.setAttribute('aria-pressed', rwMode ? 'true' : 'false');
  f.innerHTML = rwMode === 2 ? '<i class="rwh">H</i> Hard <b>' + nh + '</b>' : '\u2726 Rewards <b>' + n + '</b>';
  chips.classList.toggle('rwonly', rwMode === 1); chips.classList.toggle('rwhard', rwMode === 2); row.style.display = n || cb.style.display !== 'none' ? '' : 'none';
}
$('btClaim').onclick = () => { if ($('btClaim').dataset.k === 'event') { audio.play('click'); hub2.eventTile().querySelector('button').click(); } else { claimFrom = snap($('btClaim')); $('claimGigs').onclick(); claimFrom = null; } };
let claimFrom = null;   // batch 9: the claim row is where the reward chips fly from
$('claimGigs').onclick = () => { audio.play('click'); const fl = [...$('goalList').querySelectorAll('.gl-row.ready')].map((r, i) => [snap(r.querySelector('button')), dailyGoals(dayKey())[[...$('goalList').children].indexOf(r)], i]); const n = claimAllGoals(save, dayKey()); if (n) gigFlies(fl.map(([b, g], i) => ({ snap: claimFrom && claimFrom.rect ? { rect: fanRects(claimFrom.rect, fl.length)[i], src: (b && b.src) || iconURL(g && g.reward.beats ? 'beats' : 'sparkles') } : b && !b.src ? { rect: b.rect, src: iconURL(g && g.reward.beats ? 'beats' : 'sparkles') } : b, kind: g && g.reward.beats ? 'beats' : 'sparkles', amt: g ? g.reward.beats || g.reward.sparkles || 0 : 0 }))); if (n) { persist(); audio.play('claimrow'); refreshCur(); toast(n + ' reward' + (n > 1 ? 's' : '') + ' claimed'); renderHub(); } else toast('Nothing to claim yet'); };
bindStageNav($('btHero'), () => mode === 'hub' && hubTab === 'Battle' && $('hub').classList.contains('on') && !document.querySelector('.scr.on:not(#hub)'), dir => { const n = Math.max(1, Math.min(MAX_STAGE, save.cleared + 4, sel + dir)); if (n === sel) return false; audio.play('click'); sel = n; renderBattle(); return true; });
$('gapFix').onclick = () => { const t = $('gapFix').dataset.tab; if (!t) return; audio.play('click'); hubTab = t; hubTabSwitch(); };
$('wStrip').onclick = e => { const b = e.target.closest('.wact'); if (!b) return; const r = actTarget(+b.dataset.act, save.cleared, Math.min(MAX_STAGE, save.cleared + 4)); if (!r) return; if (r.locked) { audio.play('deny'); toast('Clear stage ' + Math.max(1, r.need) + ' to open this world'); return; } audio.play('click'); sel = r.stage; renderBattle(); };
$('stOverview').onclick = () => { audio.play('click'); openOverview({ save: () => save, max: MAX_STAGE, isBoss: isBossStage, kindOf: stageKind, reach: () => Math.min(MAX_STAGE, save.cleared + 4), sel: () => sel, audio, info: stageInfo, mine: () => power(save), rec: n => recPower(n, false), kit: () => kit, pick: n => { sel = n; renderBattle(); } }); };
$('stPrev').onclick =() => { audio.play('click'); sel = Math.max(1, sel - 1); renderBattle(); };
$('stNext').onclick = () => { audio.play('click'); sel = Math.min(MAX_STAGE, save.cleared + 4, sel + 1); renderBattle(); };
$('stGo').onclick = () => { audio.unlock(); audio.play('click'); const b = $('stGo'); b.classList.remove('go-hit'); void b.offsetWidth; b.classList.add('go-hit'); beginStage(sel); };
$('enPlus').onclick = () => { audio.unlock(); if (buyEnergy(save, Date.now())) { persist(); audio.play('upgrade'); refreshCur(); toast('Voice +10'); } else toast('Not enough Sparkles'); };
// a stage costs Voice; the Piggy Bank Parade is free
function beginStage(stage) {
  if (!spendEnergy(save, Date.now())) { toast('Out of Voice! Rest a bit or grab some tea in the Shop'); openHub('Battle'); return; }
  persist(); startRun(stage);
}

// the stage picture: the lane for this stage with the serpent on it
const stCtx = $('stCanvas').getContext('2d');
const W_ = 720;
let pvSting = '';
let bestPct = 0, pvBestKey = '', pvBestS = 0, pvT0 = -9, pvKey = -1, pvPath = null, pvBg = null, pvBgKey = '', pvLast = -1;
function drawPreview(t) {
  if (!kit) return;
  if (pvKey === sel && t - pvLast < 0.032 && t >= pvLast) return; pvLast = t;   // a stage change always repaints at once (no frame of the old stage)
  const c = stCtx, w = 400, h = 560, info = stageInfo(sel);
  if (pvKey !== sel) { const had = pvKey > 0; pvKey = sel; pvPath = buildPath(sel); pvT0 = t; const sk = info.skin + (info.boss ? '!' : ''); if (had && sk !== pvSting) audio.play('stageprev', { skin: info.skin, boss: info.boss }); pvSting = sk; }   // r9: a new species (or a boss) on the preview answers with its own sting
  // 17-perf: the backdrop (two gradients) is painted once per skin into a cached layer, then blitted; the picture itself runs at 30 fps
  if (pvBgKey !== info.skin || !pvBg) {
    pvBgKey = info.skin; pvBg = pvBg || document.createElement('canvas'); pvBg.width = w; pvBg.height = h; const b = pvBg.getContext('2d');
    const gr = b.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b2260'); gr.addColorStop(1, '#150f38'); b.fillStyle = gr; b.fillRect(0, 0, w, h);
    const sp = kit.SPECIES && kit.SPECIES[info.skin], gl = b.createRadialGradient(w / 2, h * 0.3, 10, w / 2, h * 0.3, w * 0.8); gl.addColorStop(0, (sp ? sp.base : '#8a7aff') + '55'); gl.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = gl; b.fillRect(0, 0, w, h);
  }
  c.drawImage(pvBg, 0, 0);
  { const sp = kit.SPECIES && kit.SPECIES[info.skin]; c.save(); const pk = Math.min(1, Math.max(0, (t - pvT0) / 0.32)), pe = 1 - (1 - pk) * (1 - pk); c.globalAlpha = 0.09 + 0.16 * (1 - pe); c.fillStyle = sp ? sp.lite : '#fff'; c.font = '900 210px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.translate(w / 2, h * 0.5); c.scale(1 + 0.35 * (1 - pe), 1 + 0.35 * (1 - pe)); c.fillText(String(sel), 0, 0); c.restore(); }   // round 5: the stage number as a soft watermark
  const k = Math.min((w - 20) / 720, (h - 24) / 1280), ox = (w - 720 * k) / 2, oy = 12;
  c.save(); c.translate(ox, oy); c.scale(k, k);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); pvPath.pts.forEach((q, i) => (i % 3 === 0 ? (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)) : 0));
  c.lineWidth = 90; c.strokeStyle = 'rgba(255,255,255,.07)'; c.stroke(); c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,.2)'; c.setLineDash([22, 30]); c.lineDashOffset = -t * 60; c.stroke(); c.setLineDash([]);
  if (info.kind === 'ring') { c.strokeStyle = 'rgba(255,150,190,.85)'; c.lineWidth = 12; c.beginPath(); c.arc(RING.cx, RING.cy, RING.R, 0, Math.PI * 2); c.stroke(); ringPreviewAim(c, t); } else { c.strokeStyle = 'rgba(255,150,190,.8)'; c.lineWidth = 12; c.beginPath(); c.moveTo(0, 1055); c.lineTo(720, 1055); c.stroke(); }
  const slideIn = Math.max(0, 1 - (t - pvT0) / 0.45), head = 700 + Math.sin(t * 1.2) * 60 - slideIn * slideIn * 520, n = Math.min(info.length, 16);
  for (let i = n - 1; i >= 1; i--) {
    const ps = head - i * 47, a = pointAt(pvPath, ps), b = pointAt(pvPath, ps + 10), kind = info.boss ? true : false;
    const spr = kit.SPR.body(info.skin, kind, ''); if (spr) kit.blit(c, spr, a.x, a.y, 30 * 3.9 * (i > n - 4 ? 0.8 : 1), Math.atan2(b.y - a.y, b.x - a.x));
  }
  if (info.kind === 'double') { for (let i = 9; i >= 1; i--) { const ps = head - 520 - i * 47, a = pointAt(pvPath, ps), b = pointAt(pvPath, ps + 10), spr = kit.SPR.body(info.skin, false, ''); if (spr) kit.blit(c, spr, W_ - a.x, a.y, 30 * 3.9, -Math.atan2(b.y - a.y, b.x - a.x) + Math.PI); } }
  if (bestPct > 0 && bestPct < 100) { const bk = sel + '|' + bestPct; if (pvBestKey !== bk) { pvBestKey = bk; const cu = pvPath.cum; let e = cu[cu.length - 1]; if (info.kind !== 'ring') for (let i = 0; i < pvPath.pts.length; i++) if (pvPath.pts[i].y >= 1055) { e = cu[i]; break; } pvBestS = e * bestPct / 100; } const bp = pointAt(pvPath, pvBestS); drawBestMark(c, bp.x, bp.y, bestPct, t); }
  const hp = pointAt(pvPath, head), hp2 = pointAt(pvPath, head + 10);
  kit.drawHead(c, hp.x, hp.y, 38 * (info.boss ? 1.3 : 1) * 1.14, Math.atan2(hp2.y - hp.y, hp2.x - hp.x), { skin: info.skin, boss: info.boss, t, look: [0, 1] });
  const duo = art && art.get('duo_idle'); if (duo) { const dh = info.kind === 'ring' ? 190 * RING_SCALE : 190, dw = dh * duo.width / duo.height; c.drawImage(duo, 360 - dw / 2, (info.kind === 'ring' ? RING.cy - 20 + (190 - dh) * 0.5 : 1150) - 190 * 0.75, dw, dh); }
  c.restore();
  drawPortrait(t, info);
}
// a small gold flag on the lane where your best run got to (drawn in lane units, so it is big enough to read on the small picture)
function drawBestMark(c, x, y, pct, t) {
  const pulse = 1 + Math.sin(t * 4) * 0.08;
  c.save(); c.translate(x, y); c.fillStyle = 'rgba(255,225,74,.28)'; c.beginPath(); c.arc(0, 0, 58 * pulse, 0, 6.2832); c.fill();
  c.fillStyle = '#ffe14a'; c.strokeStyle = '#fff'; c.lineWidth = 10; c.beginPath(); c.arc(0, 0, 26, 0, 6.2832); c.fill(); c.stroke();
  c.font = '900 76px system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; const lab = pct + '%', w = c.measureText(lab).width + 44;
  c.fillStyle = '#2b1608'; c.strokeStyle = '#ffe14a'; c.lineWidth = 8; c.beginPath(); c.roundRect(-w / 2, -150, w, 90, 45); c.fill(); c.stroke();
  c.fillStyle = '#ffe14a'; c.fillText(lab, 0, -104); c.restore();
}
// the species portrait next to the lane: a big face with a soft glow that bobs and looks around
const ptCtx = $('stPortrait').getContext('2d');
let ptKey = '', ptGlow = null;
function drawPortrait(t, info) {
  const c = ptCtx, S = 240, sp = kit.SPECIES && kit.SPECIES[info.skin];
  c.clearRect(0, 0, S, S);
  if (ptKey !== info.skin || !ptGlow) {   // the soft glow is the same every frame: painted once per species
    ptKey = info.skin; ptGlow = ptGlow || document.createElement('canvas'); ptGlow.width = ptGlow.height = S; const b = ptGlow.getContext('2d');
    const gl = b.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S * 0.5); gl.addColorStop(0, (sp ? sp.lite : '#fff') + 'aa'); gl.addColorStop(0.5, (sp ? sp.base : '#8a7aff') + '44'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = gl; b.fillRect(0, 0, S, S);
  }
  c.drawImage(ptGlow, 0, 0);
  const bob = Math.sin(t * 2.2) * 5, sc = (1 + Math.sin(t * 2.2 + 1) * 0.03) * portraitSpring(t - pvT0);   // r10: the face springs in when the species changes
  if (hard) { c.save(); c.strokeStyle = 'rgba(190,110,255,' + (0.35 + 0.15 * Math.sin(t * 5)) + ')'; c.lineWidth = 5; c.beginPath(); c.arc(S / 2, S / 2, S * 0.43, 0, 6.2832); c.stroke(); c.restore(); }   // r10: Hard wears a purple ring
  kit.drawHead(c, S / 2, S / 2 + bob, 78 * (info.boss ? 1.12 : 1) * sc, Math.PI / 2 + Math.sin(t * 0.9) * 0.15, { skin: info.skin, boss: info.boss, t, look: [Math.sin(t * 1.3) * 0.6, 0.8] });
}

// live countdown on the event banner (one cheap timer, only touches the DOM while the Battle tab is showing)
setInterval(() => { if (mode !== 'hub' || hubTab !== 'Battle') return; const e = document.getElementById('evCd'); if (e) e.textContent = countdownText(monthEndMs(dayKey()) - Date.now()); }, 1000);
// b12f: the stage preview of a circle stage shows the idea: the duo stands in the middle and a dotted aim line sweeps round it
function ringPreviewAim(c, t) {
  const a = -Math.PI / 2 + Math.sin(t * 1.1) * 2.2, ca = Math.cos(a), sa = Math.sin(a), r0 = 70, r1 = RING.R - 16;
  c.save(); c.setLineDash([2, 22]); c.lineDashOffset = -t * 40; c.strokeStyle = '#ffe36b'; c.lineWidth = 12; c.beginPath(); c.moveTo(RING.cx + ca * r0, RING.cy + sa * r0); c.lineTo(RING.cx + ca * r1, RING.cy + sa * r1); c.stroke(); c.setLineDash([]);
  c.translate(RING.cx + ca * (r1 + 6), RING.cy + sa * (r1 + 6)); c.rotate(a); c.fillStyle = '#ffe36b'; c.beginPath(); c.moveTo(30, 0); c.lineTo(-14, -24); c.lineTo(-4, 0); c.lineTo(-14, 24); c.closePath(); c.fill(); c.restore();
}
// the Bring line: the best build for this species, marked with what is already in the loadout
function bringFor(skin) {
  const r = recFor(skin); return { can: !!bestBuild(save, skin), why: r.why, items: r.ids.map(id => ({ name: (WEAPONS.find(w => w.id === id) || { name: id }).name, ic: icon(id), eq: save.loadout.includes(id), own: !!(save.skills[id] && save.skills[id].lv > 0) })) };
}
// BRING THEM (batch 9): one tap packs the missing owned picks into the loadout, then the Bring line shows all packed
function bindBring(box, info, sp) {
  const bg = box.querySelector('.ff-bringgo'); if (!bg) return;
  bg.onclick = e => {
    e.stopPropagation(); const nb = bestBuild(save, info.skin); if (!nb) return;
    save.loadout = nb; persist(); audio.play('bringpack');
    const old = box.querySelector('.ff-bring'), tmp = document.createElement('div'); tmp.innerHTML = bringHTML(bringFor(info.skin));
    const nw = tmp.firstElementChild; if (old && nw) { nw.classList.add('packed'); old.replaceWith(nw); }
    loadoutRow($('battleLoad'), true); toast('Packed for ' + (sp ? sp.name : 'this serpent'));
  };
}
// tap the portrait: species fun fact plus what the stage pays
$('stPortrait').onclick = () => {
  if (!isUnlocked('funfact', save)) return;   // b12p: the fun fact opens at stage 7
  const box = $('btFact'), hero = $('btHero'); if (!box.hidden) { box.hidden = true; hero.classList.remove('fact'); return; }
  audio.play('click'); const info = stageInfo(sel), sp = (kit && kit.SPECIES && kit.SPECIES[info.skin]) || null;
  box.innerHTML = factHTML({ info, sp, hard, done: sel <= save.cleared, sparkleIcon: curImg('sparkles'), bring: bringFor(info.skin) }); box.hidden = false; hero.classList.add('fact'); try { hero.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { /* ignore */ }
  bindBring(box, info, sp);
  box.querySelector('.ff-x').onclick = e => { e.stopPropagation(); audio.play('click'); box.hidden = true; hero.classList.remove('fact'); };
};
$('loadEdit').onclick = () => { audio.play('click'); hubTab = 'Skills'; renderHub(); };
const resetIn = () => { const ms = 86400000 - (Date.now() % 86400000), h = Math.floor(ms / 3600000); return h ? h + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm' : Math.floor(ms / 60000) + 'm'; };
function renderPig() {
  const el = $('pigBox'); el.innerHTML = '';
  const left = save.pig.left, tier = pigTier(save);
  { const day = dayKey(), evi = eventInfo(day); ensureEvent(save, day);
    const ev = document.createElement('div'); ev.className = 'evbanner'; ev.innerHTML = eventBannerHTML(evi, save.event.earned, save.event.claimed, Date.now(), day);
    ev.querySelector('.ev-go').onclick = () => { audio.play('click'); hub2.eventTile().querySelector('button').click(); }; el.appendChild(ev); }
  const gig = save.inv.left;
  el.appendChild(tile({ cls: 't-weapon one bn-inv', ic: '🐍', name: INV_NAME, chip: 'Stage ' + invStage(save) + '  ·  ' + gig + '/2  ·  ⏱ ' + resetIn(), desc: 'A giant serpent crashes the show. Beat it for ribbons and a little friend.', btn: gig ? 'TAKE THE STAGE' : 'COME BACK TOMORROW', disabled: !gig,
    onclick: () => { audio.unlock(); audio.play('click'); if (!useInvAttempt(save, dayKey())) return; if (!spendEnergy(save, Date.now())) { save.inv.left++; toast('Out of Voice!'); return; } persist(); startRun(invStage(save), 'inv'); } }));
  el.appendChild(tile({ cls: 't-gold one', ic: '🐷', name: PIG_NAME, chip: 'Tier ' + tier + '  ·  ' + left + '/3  ·  ⏱ ' + resetIn(), desc: 'A parade of piggy banks. Shake them hard.', btn: left ? 'JOIN THE PARADE' : 'COME BACK TOMORROW', gold: true, disabled: !left,
    onclick: () => { audio.unlock(); audio.play('click'); if (usePigAttempt(save, dayKey())) { persist(); startRun(tier, 'pig'); } } }));
}
function renderPets() {
  const list = $('petList'); list.innerHTML = '';
  const egg = document.createElement('button'); egg.className = 'eggstage' + (save.eggs > 0 ? ' has' : ''); egg.disabled = save.eggs < 1;
  egg.innerHTML = `<span class="eggpic">${icon('egg')}</span><span class="eggtx"><b>${save.eggs > 0 ? 'TAP THE EGG' : 'NO EGGS YET'}</b><small>${save.eggs > 0 ? 'Something is wiggling inside.' : 'Win stages to find more.'}</small></span><i class="eggn">× ${save.eggs}</i>`;
  egg.onclick = () => {
    if (egg.classList.contains('crack')) return; audio.unlock(); audio.play('click'); egg.classList.add('crack');
    setTimeout(() => {
      const h = hatchEgg(save); if (!h) { egg.classList.remove('crack'); return; } persist(); audio.play('levelup'); refreshCur();
      $('bTitle').textContent = h.beats ? 'JUST SOME SNACKS' : (PETS.find(p => p.id === h.id).name.toUpperCase() + '!');
      $('bLoot').className = 'loot reveal';
      const rar = h.beats ? null : petRarity(h.id), tier = h.beats ? 0 : (PET_RARITY[h.id] || 0) + 1;
      $('bLoot').innerHTML = h.beats ? `<div class="it">${curImg('beats')}<span>+${h.beats}</span></div>` : `<div class="it rar${PET_RARITY[h.id] || 0}" style="--rc:${rar.color}">${icon(h.id)}<span>+${h.n}</span><small>${rar.name.toUpperCase()}</small><small class="htag${save.pets[h.id].star === 0 && save.pets[h.id].frag === h.n ? " new" : ""}">${hatchTag(save.pets[h.id].star === 0 && save.pets[h.id].frag === h.n, h.n)}</small><small class="hfrag">${petCanUp(save, h.id) ? 'READY: tap ' + (save.pets[h.id].star ? 'MORE STARS' : 'WELCOME HOME') : 'Fragments ' + save.pets[h.id].frag + ' / ' + petCost(save.pets[h.id].star)}</small></div>`;
      hatchBurst($('bLoot'), rar ? rar.color : '#ffe14a', tier, !!(save.settings.reduceMotion || systemReduceMotion()));
      hatchRays($('bLoot'), rar ? rar.color : '#ffe14a', tier, !!(save.settings.reduceMotion || systemReduceMotion()));
      $('bOk').onclick = () => { audio.play('click'); $('bLoot').className = 'loot'; $('bOk').onclick = defaultBoxOk; openHub('Pets'); }; show('boxModal');
    }, 650);
  };
  eggNudge(egg, save); list.appendChild(egg);
  list.insertAdjacentHTML('beforeend', collectionHTML(save));
  collectionCelebrate(save, list.lastElementChild, (tier, el) => { audio.play('levelup'); toast(tier === 'perfect' ? 'Full house! Every friend shines' : 'Everyone is home!'); if (!systemReduceMotion()) hatchBurst(el, '#ffd24a', tier === 'perfect' ? 3 : 2, false); });
  { const rdy = PETS.filter(p => petCanUp(save, p.id)).length; if (save.eggs > 1 || rdy) { const row = document.createElement('div'); row.className = 'refrow'; row.style.justifyContent = 'center'; row.style.gap = '10px'; if (save.eggs > 1) { const b = document.createElement('button'); b.className = 'btn small alt'; b.textContent = 'HATCH ALL (' + save.eggs + ')'; b.onclick = () => { const res = hatchAll(save); if (res.length) { persist(); audio.play('levelup'); refreshCur(); toast(res.length + ' eggs hatched'); renderHub(); } }; row.appendChild(b); } if (rdy) { const b = document.createElement('button'); b.className = 'btn small gold'; b.textContent = 'STAR UP ALL (' + rdy + ')'; b.onclick = () => { if (upgradePetsAll(save)) { persist(); audio.play('upgrade'); renderHub(); } }; row.appendChild(b); } list.appendChild(row); } }
  list.appendChild(chipRow(['All', 'Owned', 'Ready'], petFilter, o => { petFilter = o; audio.play('click'); renderPets(); }, { Ready: PETS.filter(p => petCanUp(save, p.id)).length }));
  { const row = list.lastElementChild; const sb = document.createElement('button'); sb.className = 'fchip'; sb.textContent = 'Sort: ' + petSort; sb.onclick = () => { petSort = petSort === 'Order' ? 'Stars' : petSort === 'Stars' ? 'Joy' : petSort === 'Joy' ? 'Rarity' : 'Order'; audio.play('click'); renderPets(); }; if (row && row.classList.contains('fchips')) row.appendChild(sb); }
  const petKey = p => { const k = save.pets[p.id]; return petSort === 'Stars' ? -k.star : petSort === 'Joy' ? -(k.joy || 0) : petSort === 'Rarity' ? -(PET_RARITY[p.id] || 0) : 0; };
  for (const p of (petSort === 'Order' ? PETS : PETS.slice().sort((a, b) => petKey(a) - petKey(b)))) {
    if (petFilter === 'Owned' && save.pets[p.id].star < 1) continue; if (petFilter === 'Ready' && !petCanUp(save, p.id)) continue;
    const k = save.pets[p.id], owned = k.star > 0, maxed = k.star >= PET_MAX_STAR, need = maxed ? 0 : petCost(k.star), eq = save.petEquip.includes(p.id);
    const stars = '★ ' + k.star + '/' + PET_MAX_STAR;
    const starH = Array.from({ length: PET_MAX_STAR }, (_, n) => `<i class="star${n < k.star ? ' on' : ''}">★</i>`).join('');
    const t = tile({ cls: 'coll pet t-weapon' + (eq ? ' on-loadout' : '') + (owned ? '' : ' unowned') + (petCanUp(save, p.id) ? ' ready' : ''), ic: icon(p.id), lock: !owned, name: petLabel(save, p), chip: owned ? (eq ? 'WALKING' : 'AT HOME') : 'NEW', chipCls: owned ? (eq ? 'eq' : '') : 'lock', desc: p.flavor, pips: starH,
      bar: need ? Math.min(100, Math.round((k.frag / need) * 100)) : 100, barText: need ? k.frag + ' / ' + need : '', btn: maxed ? 'FULL STARS' : owned ? 'MORE STARS' : 'WELCOME HOME', disabled: !petCanUp(save, p.id),
      onclick: () => { if (petUp(save, p.id)) { persist(); audio.unlock(); audio.play('upgrade'); renderHub(); } } });
    if (owned) { const e = document.createElement('button'); e.className = 'btn small go alt'; e.textContent = eq ? 'BENCH' : 'WALK WITH ME'; e.onclick = () => { if (togglePet(save, p.id)) { persist(); audio.play('click'); renderHub(); } }; t.appendChild(e); }
    { const rr = petRarity(p.id), ri = PET_RARITY[p.id] || 0; t.style.setProperty('--rc', rr.color); t.classList.add('prar' + ri); t.querySelector('.ds').insertAdjacentHTML('beforebegin', rarityChip(rr, ri)); }
    if (isNewItem(save, 'p', p.id)) t.insertAdjacentHTML('afterbegin', newRibbonHTML);
    if (owned) t.querySelector('.ds').insertAdjacentHTML('afterend', joyHTML(k, true));
    t.onclick = e => { if (!e.target.closest('button')) { audio.play('click'); sheets.petSheet(p.id); } };
    tileA11y(t, petTileLabel(save, p, k, eq, petCanUp(save, p.id)), () => t.onclick({ target: t })); if (owned) { petOnTile(t, p.id, audio, systemReduceMotion()); joyBadge(t, k.joy || 0); }
    list.appendChild(t);
  }
  if (!list.querySelector('.tile')) list.appendChild(emptyCardUx('pets', petFilter, () => { petFilter = 'All'; audio.play('click'); renderPets(); }));
  foldTab('Pets');
}
function renderGoals() {
  const list = $('goalList'); list.innerHTML = '';
  const day = dayKey(), goals = dailyGoals(day);
  let n = 0;
  for (const goal of goals) {
    const prog = goalProgress(save, day, goal), done = prog >= goal.target, claimed = !!(save.daily && save.daily.day === day && save.daily.claimed[goal.id]);
    const rw = goal.reward.beats ? `${goal.reward.beats} ${curImg('beats')}` : `${goal.reward.sparkles} ${curImg('sparkles')}`;
    const state = claimed ? 'claimed' : done ? 'ready' : 'wait';
    const row = document.createElement('div'); row.className = 'gl-row ' + state; row.innerHTML = goalRowHTML(goal.text, prog, goal.target, rw, state, goal.id);
    if (state === 'ready') row.querySelector('button').onclick = () => { { const btn = snap(row.querySelector('button')); if (claimGoal(save, day, goal.id)) { persist(); audio.unlock(); audio.play('claimrow'); gigFlies([{ snap: btn, kind: goal.reward.beats ? 'beats' : 'sparkles', amt: goal.reward.beats || goal.reward.sparkles || 0 }]); renderHub(); } } };
    if (claimed) n++;
    list.appendChild(row);
  }
  const hd = $('glCount'), rdy = list.querySelectorAll('.gl-row.ready').length; if (hd) { hd.textContent = rdy ? rdy + ' READY' : n + '/' + goals.length; hd.classList.toggle('rdy', rdy > 0); }
  { const cg = $('claimGigs'), rd = list.querySelectorAll('.gl-row.ready').length; if (cg) { cg.textContent = rd ? 'CLAIM ALL (' + rd + ')' : n === goals.length ? 'ALL DONE \u2713' : 'CLAIM ALL'; cg.classList.toggle('rdy', rd > 0); cg.classList.toggle('alld', !rd && n === goals.length); } }
  { const rows = list.querySelectorAll('.gl-row.ready'), ci = claimInfo(rows.length, rows.length ? rows[0].querySelector('.gl-tx b').textContent : '', eventReadyCount(save.event.earned, save.event.claimed)), cb = $('btClaim');
    if (cb) { cb.hidden = !ci; if (ci) { cb.dataset.k = ci.kind; cb.innerHTML = `<span class="bc-ic">${ci.ic}</span><span class="bc-tx">${ci.html}</span>${ci.kind === 'gig' ? claimChips([...rows].map(r => { const g = goals[[...list.children].indexOf(r)]; return g ? { kind: g.reward.beats ? 'beats' : 'sparkles', amt: g.reward.beats || g.reward.sparkles || 0 } : null; }), { beats: curImg('beats'), sparkles: curImg('sparkles') }) : ''}<span class="bc-go">${ci.go}</span>`; cb.setAttribute('aria-label', ci.kind === 'gig' ? 'Claim finished gigs' : 'Open the event rewards'); } syncDock(); } }
}
function renderSkills() {
  const list = $('skillList'); list.innerHTML = '';
  loadoutRow($('loadoutRow'), false); enableDrag($('loadoutRow'), { save: () => save, persist: () => persist(), audio, rerender: () => renderHub() }); renderPresets($('presetRow'), { save: () => save, persist: () => persist(), audio, icon, rerender: () => renderHub() });
  { let rs = $('recStrip'); if (!rs) { rs = document.createElement('div'); rs.id = 'recStrip'; $('presetRow').after(rs); } try { renderRecStrip(rs, { save: () => save, persist: () => persist(), audio, icon, rerender: () => renderHub(), species: kit && kit.SPECIES }); } catch (e) { /* ignore */ } }
  { const rdy = WEAPONS.filter(w => save.skills[w.id].lv > 0 && save.skills[w.id].lv < SKILL_MAX_LV && save.skills[w.id].frag >= skillUpgradeCost(save.skills[w.id].lv).frag).length; if (rdy) { const b = document.createElement('button'); b.className = 'btn small gold sec'; b.style.cssText = 'grid-column:1/-1;margin:2px auto'; b.textContent = 'LEVEL UP ALL READY (' + rdy + ')'; b.onclick = () => { if (upgradeAllSkills(save)) { persist(); audio.play('upgrade'); renderHub(); } }; list.appendChild(b); } }
  const isRdy = w => { const k = save.skills[w.id]; return k.lv > 0 ? k.lv < SKILL_MAX_LV && k.frag >= skillUpgradeCost(k.lv).frag : k.frag >= w.frag && (save.cleared || 0) >= (w.stage || 0); };
  { const row = chipRow(['All', 'Owned', 'Ready'], skFilter, o => { skFilter = o; audio.play('click'); renderSkills(); }, { Ready: WEAPONS.filter(isRdy).length });
    const sb = document.createElement('button'); sb.className = 'fchip'; sb.textContent = 'Sort: ' + skSort; sb.onclick = () => { skSort = skSort === 'Tier' ? 'Level' : skSort === 'Level' ? 'Rank' : skSort === 'Rank' ? 'Closest' : 'Tier'; audio.play('click'); renderSkills(); }; row.appendChild(sb); list.appendChild(row); }
  const groups = [[], [], []], keyOf = new Map();
  for (const w of WEAPONS) {
    const k = save.skills[w.id], owned = k.lv > 0, eq = save.loadout.includes(w.id);
    if (skFilter === 'Owned' && !owned) continue; if (skFilter === 'Ready' && !isRdy(w)) continue;
    let need = 0, can = false, label = '', act = () => false;
    const gated = !owned && (save.cleared || 0) < (w.stage || 0);
    if (!owned) { need = w.frag; can = k.frag >= need && !gated; label = gated ? 'CLEAR STAGE ' + w.stage : 'UNLOCK'; act = () => unlockSkill(save, w.id); }
    else if (k.lv >= SKILL_MAX_LV) label = 'MAX LEVEL';
    else { const c = skillUpgradeCost(k.lv); need = c.frag; can = k.frag >= c.frag; label = can ? 'UPGRADE READY' : 'UPGRADE'; act = () => levelSkill(save, w.id); }
    const ready = can && (!owned || k.lv < SKILL_MAX_LV);
    const pipH = owned ? Array.from({ length: SKILL_MAX_LV }, (_, n) => `<i class="pip${n < k.lv ? ' on' : ''}"></i>`).join('') : '';
    const t = tile({ cls: 'coll t-weapon tier' + (w.tier || 0) + (eq ? ' on-loadout' : '') + (owned ? '' : ' unowned') + (ready ? ' ready' : ''), ic: icon(w.id), lock: !owned && (gated ? 'Stage ' + w.stage : true), name: w.name, chip: owned ? ('Lv ' + k.lv + (eq ? ' ✓' : '')) : (gated ? 'STAGE ' + w.stage : 'LOCKED'), chipCls: owned ? (eq ? 'eq' : '') : 'lock', desc: w.desc, pips: pipH,
      bar: need ? Math.min(100, Math.round((k.frag / need) * 100)) : 100, barText: need ? 'Fragments ' + k.frag + ' / ' + need : 'Fully upgraded', btn: label, disabled: !can, onclick: () => { if (act()) { persist(); audio.unlock(); audio.play('upgrade'); renderHub(); } } });
    if (owned) {
      const e = document.createElement('button'); e.className = 'btn small go alt'; e.textContent = eq ? 'REMOVE FROM LOADOUT' : 'EQUIP';
      const full = !eq && save.loadout.length >= LOADOUT_SIZE; if (eq) e.textContent = 'UNEQUIP'; if (full) e.textContent = 'SWAP IN';
      e.disabled = eq && save.loadout.length <= 1;
      e.onclick = () => { if (full) { audio.play('click'); swapSheet({ save: () => save, persist: () => persist(), audio, icon, rerender: () => renderHub() }, w.id); return; } if (toggleLoadout(save, w.id)) { persist(); audio.play('click'); renderHub(); } };
      t.appendChild(e);
    }
    if (owned) { const rk = skillRank(save, w.id); t.querySelector('.ds').insertAdjacentHTML('beforebegin', `<em class="rk r${rk.rank}" title="Mastery rank">🎖 ${rk.name}</em>`); keyOf.set(t, skSort === 'Level' ? -k.lv : skSort === 'Rank' ? -rk.val : skSort === 'Closest' ? -(need ? k.frag / need : 0) : (w.tier || 0)); } else keyOf.set(t, skSort === 'Tier' ? (w.tier || 0) : skSort === 'Closest' ? -(need ? k.frag / need : 0) : 0);
    if (isNewItem(save, 's', w.id)) t.insertAdjacentHTML('afterbegin', newRibbonHTML);
    t.onclick = e => { if (!e.target.closest('button')) { audio.play('click'); sheets.skillSheet(w.id); } };
    { const rk9 = owned ? skillRank(save, w.id) : null; if (rk9) masteryMark(t, rk9.rank); tileA11y(t, skillTileLabel(w, k, { gated, eq, ready, rank: rk9 && rk9.rank }), () => t.onclick({ target: t })); }
    groups[eq ? 0 : owned ? 1 : 2].push(t);
  }
  for (const g of groups) g.sort((a, b) => keyOf.get(a) - keyOf.get(b));
  if (!groups.some(g => g.length)) list.appendChild(emptyCardUx('skills', skFilter, () => { skFilter = 'All'; audio.play('click'); renderSkills(); }));
  [['Equipped', '#6fe08a'], ['Owned', '#4fd8f0'], ['Not Owned', '#8a7aa8']].forEach(([name, col], i) => {
    if (!groups[i].length) return;
    const h = document.createElement('div'); h.className = 'sec'; h.innerHTML = `<span style="background:${col}">${name}</span>`; list.appendChild(h);
    for (const t of groups[i]) list.appendChild(t);
  });
  foldTab('Skills');
}
let skFilter = 'All', skSort = 'Tier', petFilter = 'All', petSort = 'Order';
const sheets = createSheets({ save: () => save, persist: () => persist(), audio, icon, rerender: () => renderHub() });
const defaultBoxOk = () => { audio.play('click'); openHub('Shop'); };
$('bOk').onclick = defaultBoxOk;
const toast = msg => { if (/^(Not enough|Nothing to claim|Out of Voice|That code does not)/.test(msg)) audio.play('deny'); const t = $('toast'); t.textContent = msg; { const tn = dressToast(t, msg); if (TONE_HAPTIC[tn]) haptic(TONE_HAPTIC[tn], save && save.settings); } t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); };
const hub2 = createHub2({ unlocked: id => isUnlocked(id, save), $, toast, tile, icon, curImg, audio, save: () => save, persist, show, openHub: t => openHub(t), renderHub: () => renderHub(), refreshCur: () => refreshCur(), dayKey, resetBoxOk: () => { $('bOk').onclick = defaultBoxOk; }, bodyURL: skin => { if (!kit) return ''; if (!(('b|' + skin) in iconCache)) { const spr = kit.SPR.body(skin, false, ''); iconCache['b|' + skin] = spr && spr.c.toDataURL ? spr.c.toDataURL() : ''; } return iconCache['b|' + skin]; } });
try { const pb = $('pBody'); if (pb && typeof MutationObserver === 'function') new MutationObserver(() => { if ($('pTitle').textContent === 'GOALS') trimGoalsPanel(pb, save); }).observe(pb, { childList: true }); } catch (e) { /* cosmetic */ }   // b12p: the long Goals page keeps out sections that are not open yet

// ---------------------------------------------------------------- runs
function newDemo() {
  demo = createGame({ seed: (Math.random() * 1e9) | 0, bot: true, stage: 1 + ((Math.random() * 3) | 0) });
  richDemo(demo);
}
function startRun(stage, mode2 = '') {
  const fromHub = shownId === 'hub';
  if (!mode2) save.last = { stage, hard: !!(hard && stage <= save.cleared) };
  audio.unlock(); fsOnRun(); audio.music(true, stage === 1 && !mode2);
  sel = stage; ranResult = false; endT = 0;
  g = createGame({ seed: (Math.random() * 1e9) | 0, meta: platMeta(save), skills: skillLevels(), loadout: save.loadout, stage, mode: mode2, hard: hard && !mode2 && stage <= save.cleared, outfit: save.outfits.worn, arts: Object.fromEntries(Object.entries(save.keeps).map(([k, v]) => [k, v.lv])), pets: Object.fromEntries(PETS.map(p => [p.id, save.pets[p.id].star])), petEquip: save.petEquip });
  g.petJoy = save.petEquip.map(id => (save.pets[id].joy || 0) >= 100);   // round 6: an overjoyed pet shows off in the run (cosmetic)
  mode = 'play'; acc = 0; clk.drop(); cardsFor = null; reviveAsked = false; show(''); resetGroove(); if (fromHub) curtainOpen(document.documentElement.classList.contains('rm'));
  announce('Stage ' + stage + (isBossStage(stage) ? ', boss stage' : '') + ' started. ' + (g.snakes.length > 1 ? 'Two snakes. ' : '') + (g.ring ? 'The snake circles you. ' : '') + (g.ring ? 'Drag to aim, or use the arrow keys. The duo shoots on its own.' : 'Slide to move, the duo shoots up on its own.'));
  window.CS.g = g;
  resetAimSr(); setFieldLabel(!!g.ring); aimS.now = aimS.tgt = -Math.PI / 2; aimHint = !!g.ring && aimHintLeft(); if (g.ring) aimHintBump();
  if (!mode2) teaseGoal(save, dayKey(), !!(save.settings.reduceMotion || systemReduceMotion())); else hideTease();
  startGoals16(mode2);
}
// b16i: weekly mutator (one rule change per week) and three small session goals shown when a run starts
function startGoals16(mode2) {
  try { hideRunGoals(); if (mode2) return; if (isUnlocked('weekmut', save)) applyMutator(g, dayKey()); if (isUnlocked('sessgoals', save)) { dealGoals(save, dayKey(), save.cleared + 1); showRunGoals(save, dayKey(), !!(save.settings.reduceMotion || systemReduceMotion()), isUnlocked('weekmut', save)); } } catch (e) { /* ignore */ }
}
function finishGoals16(r) {
  try { hideRunGoals(); const st = bumpStreak(save, dayKey()), res = isUnlocked('sessgoals', save) ? checkGoals(save, r, save.cleared + 1) : { ticked: [], set: false, beats: 0 }; return { st, res }; } catch (e) { return null; }
}
let awayH = hoursAway(Date.now()); addEventListener('pagehide', () => stampVisit(Date.now()));
function refreshTitle() { $('titleInfo').innerHTML = titleInfoHTML(save, totalStars(save)) || firstGoalHTML(save); { const w = welcomeBack(save, Date.now(), awayH), el = $('wb12'); el.innerHTML = welcomeHTML(w); el.hidden = !w; $('title').classList.toggle('ret12', !!w); $('title').classList.toggle('hand13', !!w && wantsHand(save)); awayH = 0; stampVisit(Date.now()); } try { dressDuo(document.querySelector('.stage12 .hero'), { outfit: wornOutfit(save) }); } catch (e) { /* ignore */ } }
function toTitle() { refreshTitle(); mode = 'title'; audio.music(false); audio.hub(false); refreshCur(); newDemo(); show('title'); }

// ---------------------------------------------------------------- upgrade cards
function showCards() {
  bakeCardArt();
  if (!lockState.keep) lockState.i = -1; lockState.keep = false;
  const wrap = $('cards'); wrap.innerHTML = ''; pickLock = false; $('levelup').classList.remove('flashing');
  const top = Math.max(0, ...g.choices.map(c => c.rarity || 0)); $('levelup').dataset.top = top; { const bn = $('levelup').querySelector('.banner'); if (bn) bn.dataset.lv = g.level | 0; } $('bandSheet').classList.remove('on'); wrap.dataset.n = g.choices.length; try { $('levelup').style.setProperty('--lvtop', hudBottomPx(R && R.layout(), innerWidth) + 'px'); } catch (e) { /* css fallback */ }
  for (const c of g.choices) if (c.kind === 'passive' && !c.stat) c.stat = passiveStat(g, c);
  { const old = document.querySelector('.rvl'); if (old) old.remove(); const rv = revealHTML(top); if (rv) { document.body.insertAdjacentHTML('beforeend', rv); setTimeout(() => { const e = document.querySelector('.rvl'); if (e) e.remove(); }, 1900); } }
  g.choices.forEach((c, i) => {
    const rn = c.rarity || 0, rar = RARITIES[rn], b = document.createElement('button'); b.className = 'card pick c-' + c.kind + ' r' + rn; b.style.setProperty('--d', (i * 0.11 + 0.05).toFixed(2) + 's');
    const have = c.lvl + (c.gain && c.kind === 'weapon' ? c.gain : 1);
    const pips = Array.from({ length: Math.min(c.max, 12) }, (_, k) => `<span class="pip ${k < c.lvl ? 'on' : k < have ? 'gh' : ''}"></span>`).join(''), mt = cardMeter(g, c);
    const tag = `<span class="rar">${['●', '◆', '▲', '★', '✦', '✹'][rn]} ${rar.name.toUpperCase()}</span>`;
    const dm = c.isNew && c.kind === 'weapon' ? ['', 'New skill', 'Lv 0', 'Lv ' + c.gain] : c.stat && /^(.*?):?\s*([^:→]+?)\s*→\s*(.+)$/.exec(c.stat);
    const stat = dm ? `<div class="delta"><span class="dl">${dm[1]}</span><span class="dv"><i>${dm[2]}</i><em>→</em><b>${dm[3]}</b></span>${ghostBarHTML(mt)}</div>` : c.stat ? `<div class="delta"><span class="dv"><b>${c.stat}</b></span>${ghostBarHTML(mt)}</div>` : '';
    const syn = synergyHint(g, c);
    const fx = rn >= 4 ? '<span class="rays"></span>' + Array.from({ length: rn === 5 ? 8 : 5 }, (_, k) => `<span class="pt" style="--x:${(8 + k * (84 / (rn === 5 ? 7 : 4))).toFixed(0)}%;--t:${(1.6 + (k * 0.37) % 1.2).toFixed(2)}s;--w:${((k * 0.29) % 1.5).toFixed(2)}s"></span>`).join('') : '';
    b.innerHTML = `${fx}${cardFoilHTML(rn)}<span class="key">${i + 1}</span>${g.rerolls > 0 ? lockHTML(i) : ''}<div class="ic">${foilHTML(rn)}${c.kind === 'weapon' ? levelRingHTML(mt) : ''}${icon(c.id)}<span class="kd">${kindLabel(c)}</span>${c.isNew ? '<span class="newtag">NEW</span>' : ''}</div><div class="bd"><div class="nm"><span class="nt">${c.name}</span>${tag}</div><div class="ds">${plainDesc(c)}</div>${dpsNote(c) ? `<div class="dpsn">${dpsNote(c)}</div>` : ''}${stat}${syn ? `<div class="syn">${syn}</div>` : ''}<div class="pips">${pips}</div></div><span class="shine"></span><span class="rdy" aria-hidden="true"></span>`;
    b.setAttribute('aria-label', `Option ${i + 1}: ${c.name}, ${RARITY_WORDS[rn]} rarity${c.isNew ? ', new' : ''}. ${c.desc}${c.stat ? '. ' + c.stat : ''}${dpsNote(c) ? '. ' + dpsNote(c) : ''}`);
    b.onclick = e => { if (e.target.closest && e.target.closest('.lockb')) { toggleLock(wrap, i); audio.play('click'); return; } if (!guardAllows(lvGuard, i, e.detail > 0, performance.now())) return; pick(i); };
    if (lockState.i === i && g.rerolls > 0) b.classList.add('kept');
    wrap.appendChild(b);
  });
  markLinks(wrap, offeredLinks(g, g.choices)); armCards(wrap, lvGuard, performance.now());
  { const bonus = Math.round((20 + 4 * g.stage) * g.p.coinMul); $('skipBtn').innerHTML = skipHTML(bonus); $('skipBtn').setAttribute('aria-label', 'Skip for ' + bonus + ' beats'); }
  $('refreshBtn').disabled = g.rerolls <= 0; $('refreshLeft').innerHTML = '<span class="rp">' + refreshPips(g) + '</span>'; $('refreshBtn').classList.toggle('empty', g.rerolls <= 0); $('luckBox').innerHTML = luckHTML(g) + (rrChip ? dealChipHTML(g, g.choices) : ''); rrChip = false; $('buildStrip').innerHTML = buildHTML(g, icon); markPartners($('buildStrip'), partnerIds(g, g.choices));
  cardsFor = g.choices; { let mr = 0; for (const c of g.choices) mr = Math.max(mr, c.rarity || 0); audio.play('card' + mr); if (mr >= 3) setTimeout(() => { if (mode === 'play' && g.phase === 'levelup') audio.play('stinger'); }, 220); } show('levelup');
  announce('Choose an upgrade. ' + g.choices.map((c, i) => `${i + 1}: ${c.name}, ${RARITY_WORDS[c.rarity || 0]}`).join('. ') + '. Press 1, 2 or 3, or Tab to a card and press Enter.' + (g.rerolls > 0 ? ' Press L then a number to lock a card for the refresh.' : ''));
}
let pickLock = false, rrChip = false;
// 35-t: pointer taps are ignored for 450 ms after the cards appear and must press and release on the same card; keys and screen readers are never guarded
const lvGuard = { at: 0, down: -1, moved: false }; trackPress($('cards'), lvGuard);
{ const bs = $('buildStrip'), sh = $('bandSheet'); const tog = () => { if (!bs.innerHTML) return; if (!sh.classList.contains('on')) { sh.innerHTML = bandSheetHTML(g, icon); sh.classList.add('on'); } else sh.classList.remove('on'); }; bs.onclick = tog; sh.onclick = () => sh.classList.remove('on'); bs.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } }; }
function pick(i) {
  if (mode !== 'play' || g.phase !== 'levelup' || pickLock) return;
  { const c = g.choices[i]; if (c) announce('Picked ' + c.name + ', ' + RARITY_WORDS[c.rarity || 0] + '. ' + (c.stat || '')); }
  audio.play('upgrade'); { const pr = (g.choices[i] && g.choices[i].rarity) | 0; audio.play('card' + pr); if (pr >= 4) audio.play('stinger'); }
  const cs = $('cards').children, el = cs[i];
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { choose(g, i); cardsFor = null; if (g.phase !== 'levelup') show(''); return; }
  pickLock = true; el.classList.add('chosen'); { const pr = (g.choices[i] && g.choices[i].rarity) | 0; pickBurst(el, RARITIES[pr].color, pr); } [...cs].forEach((c, k) => { if (k !== i) c.classList.add('gone'); }); $('levelup').classList.add('flashing'); { const pc = g.choices[i]; flyPick(el, $('buildStrip'), 360, () => { if (pc) { tickBand($('buildStrip'), pc.id, pc.kind === 'weapon' ? (pc.gain || 1) : 1, icon, RARITIES[pc.rarity | 0].color); if (pc.kind !== 'weapon' && chainPulse($('buildStrip'), g, pc.id, pc.isNew)) audio.play('click'); } }); }
  setTimeout(() => { if (!pickLock) return; pickLock = false; if (mode !== 'play' || g.phase !== 'levelup') return; choose(g, i); cardsFor = null; if (g.phase !== 'levelup') show(''); }, 580);
}
$('skipBtn').onclick = () => { if (mode === 'play' && skipPick(g)) { audio.play('skip'); cardsFor = null; if (g.phase === 'levelup') showCards(); else show(''); } };
$('refreshBtn').onclick = () => { const pt = g.choices ? Math.max(0, ...g.choices.map(c => c.rarity || 0)) : 0; const prevC = g.choices; if (mode === 'play' && reroll(g)) { audio.play('click'); markReroll(); keepLocked(g.choices, prevC); rrChip = true; showCards(); betterRoll($('cards'), pt); { const rb = $('refreshBtn'), cw = $('cards'); rb.classList.remove('rr'); cw.classList.remove('rrx'); void rb.offsetWidth; rb.classList.add('rr'); cw.classList.add('rrx'); setTimeout(() => { rb.classList.remove('rr'); cw.classList.remove('rrx'); }, 650); } } };

// ---------------------------------------------------------------- input
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  if (mode !== 'play' || g.phase === 'levelup') return;
  if (R.skipCard && R.skipCard() && g.phase === 'won') return;   // r12: a tap skips a long card (the clear card ends the song, so that tap is not a steer)
  const gp = R.toGame(e.clientX * (canvas.width / innerWidth), e.clientY * (canvas.height / innerHeight));
  const zone = R.hudZone(gp);   // pause and stats buttons, shifted by the notch inset (hud.js)
  if (zone) { R.hudPress(zone); audio.play('click'); buzz(8); }
  if (zone === 'pause') { if (pauseAllowed(save.settings.pauseGuard)) pause(); else toast('Tap again to pause'); return; }
  if (zone === 'stats') { showStats(); return; }
  if (g.encore >= 1 && Math.hypot(gp.x - g.p.x, gp.y - g.p.y) < 110) encoreTap = true;   // tap the duo for the Encore blast
  if (g.ring) aimAt(e, true);   // b11: a touch anywhere aims (b12f: arena touch aims at it, elsewhere a floating stick)
  if (!g.ring && save.settings.thumbZone && !inThumbZone(e.clientY, innerHeight)) return;   // thumb zone: only the bottom third steers
  if (followMode()) {   // b12s: the duo chases the finger x at once (no dead zone, no joystick base)
    if (fol.on) return;
    fol.on = true; fol.id = e.pointerId; fol.x = folX(gp.x); fol.ptT = performance.now();
    canvas.setPointerCapture(e.pointerId); return;
  }
  if (joy.on) return;
  joy.on = true; joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.dx = joy.dy = 0;
  joy.x = gp.x; joy.y = gp.y; joy.tz = save.settings.thumbZone ? gp.x : null; joy.hide = !!g.ring && aimS.mode === 1;   // b12f: no stick ring when the finger aims at the arena
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or lost pointer */ }
});
canvas.addEventListener('pointermove', e => {
  if (mode === 'play' && g.ring && (e.pointerType === 'mouse' || (joy.on && e.pointerId === joy.id))) { if (e.pointerType === 'mouse' && !aimS.mode) aimS.mode = 1; aimAt(e, false); return; }   // b11: drag (or hover with a mouse) to sweep the aim
  if (fol.on) { if (e.pointerId === fol.id) { fol.x = folX(R.toGame(e.clientX * (canvas.width / innerWidth), 0).x); fol.ptT = performance.now(); } return; }
  if (!joy.on || e.pointerId !== joy.id) return;
  if (joy.tz != null) { joy.tz = R.toGame(e.clientX * (canvas.width / innerWidth), 0).x; return; }   // thumb zone: the duo follows the finger
  const L = R.layout(), dpr = canvas.width / innerWidth, rad = 70 * L.s / dpr;
  let dx = (e.clientX - joy.sx) / rad;   // the cell slides left and right only
  if (Math.abs(dx) > 1) { dx = Math.sign(dx); joy.sx = e.clientX - dx * rad; }   // anchor follows the finger
  const gp = R.toGame(joy.sx * dpr, joy.sy * dpr); joy.x = gp.x;
  joy.dx = dx; joy.dy = 0;
});
const endJoy = e => { if (e.pointerId === aimS.id) aimUp(aimS); if (e.pointerId === fol.id) fol.on = false; if (e.pointerId === joy.id) { joy.tz = null; joy.on = false; joy.dx = joy.dy = 0; } };
canvas.addEventListener('pointerup', endJoy); canvas.addEventListener('pointercancel', endJoy); canvas.addEventListener('lostpointercapture', endJoy);   // b13c: a lost capture never leaves a ghost finger
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true; if (MOVE_KEYS.has(e.key.toLowerCase())) fol.keyT = performance.now();
  if (e.key === 'Escape') goBack(false);
  else if (e.key.toLowerCase() === 'p') { mode === 'play' ? pause() : mode === 'pause' && !$('settings').classList.contains('on') && !$('panel').classList.contains('on') ? resume() : 0; }
  if (mode === 'play' && g.phase === 'levelup' && !pickLock) { const lk = lockKey(e, $('cards'), g.rerolls); if (lk) { if (lk.i >= 0) { e.preventDefault(); const on = toggleLock($('cards'), lk.i) === lk.i; audio.play('click'); announce(on ? 'Card ' + (lk.i + 1) + ' locked. A reroll keeps it.' : 'Lock removed.'); } else if (lk.armed) announce('Lock: press 1, 2 or 3.'); else if (e.key.toLowerCase() === 'l') announce('Nothing to lock, no refreshes left.'); return; } }
  if (mode === 'play' && g.phase === 'levelup' && '123'.includes(e.key)) pick(+e.key - 1);
  if (e.key.toLowerCase() === 'm') toggleMute();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'play' && g.phase !== 'levelup') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && g.phase !== 'levelup') pause(); });
let encoreTap = false;
function readInput() {
  if (g.ring) {   // b11: circle stages: the duo is fixed, left/right (or A/D) turn the aim, the sim gets an eased angle
    if (keys.a || keys.arrowleft) aimS.tgt -= 2.8 / 60; if (keys.d || keys.arrowright) aimS.tgt += 2.8 / 60;
      { const ka = keyAim(keys); if (ka !== null) aimS.tgt = ka; }   // b12k: up, down and the diagonals snap (left or right alone still turn)
      if (joy.sdx) aimS.tgt = sliderAim(aimS.tgt, joy.sdx, 1 / 60);   // b12k: the slide bar (either hand) turns the aim in circle stages
      aimTick(aimS, 1 / 60);   // b12f: frame rate independent smoothing
      if (sweepTick(aimTk, aimS.now, now8())) audio.play('aimtick');   // b12: a quiet tick per 15 degrees of aim sweep
      const enc2 = encoreTap || !!keys[' ']; encoreTap = false; watchAim(aimS.now);
      return { mx: 0, my: 0, aim: aimAssisted(aimS, g, 1 / 60, !!save.settings.aimAssist), encore: enc2 };
  }
  let mx = joy.dx + (joy.sdx || 0);
  if (joy.on && joy.tz != null) mx += zoneSteer(joy.tz, g.p.x);
  if (keys.a || keys.arrowleft) mx -= 1; if (keys.d || keys.arrowright) mx += 1;
  const enc = encoreTap || !!keys[' ']; encoreTap = false;
  if (fol.on && followMode() && (mx === 0 || fol.ptT > fol.keyT) && !joy.sdx) return { mx: 0, my: 0, tx: fol.x, encore: enc };   // b12s: follow finger; the latest of finger and keys wins
  return { mx, my: 0, encore: enc };
}
function pause() { if (mode !== 'play' || g.phase === 'dead' || g.phase === 'won' || g.phase === 'levelup') return; mode = 'pause'; joy.on = false; fol.on = false; joy.dx = joy.dy = 0; pauseRecap(); quitHold.reset(); show('pause'); }
// Escape and the Android back button share this: close what is open, pause a run, resume a pause, leave the end screen.
// The back button also walks the hub up to the title; Escape stays put there.
function goBack(fromBtn) {
  const sc = document.querySelector('.scr.on'), id = sc ? sc.id : '';
  if (id === 'settings') $('setClose').click();
  else if (id === 'panel') $('pClose').click();
  else if (id === 'boxModal') $('bOk').click();
  else if (mode === 'play') pause();
  else if (id === 'pause') resume();
  else if (id === 'result') $('rHub').click();
  else if (id === 'hub' && fromBtn) toTitle();
}
// Android back: one spare history entry is kept while we are off the title, so back never throws the player out of a run
let backArmed = false;
function armBack() { if (!backArmed) { try { history.pushState({ cs: 1 }, ''); backArmed = true; } catch (e) { /* no history */ } } }
addEventListener('popstate', () => { backArmed = false; if (mode === 'title') return; goBack(true); if (mode !== 'title') armBack(); });
function resume() { mode = 'play'; show(''); last = performance.now(); if (R && R.resumeFx) R.resumeFx(g); petsCall(); }
// r8: the walking pets answer BACK ON! (the resume count-in is 3 x 0.27 s)
function petsCall() { const ps = g && g.pets ? g.pets.slice() : []; if (ps.length && !systemReduceMotion()) setTimeout(() => { if (mode === 'play') ps.forEach((id, i) => setTimeout(() => audio.play(PETSND[id] || 'chirp'), i * 90)); }, 830); }
function openSettings(back) {
  foldSettings($('settings'));
  const paint = () => {
    for (const b of document.querySelectorAll('#settings .tgl')) { const k = b.dataset.k, on = k === 'sound' ? !save.muted : k === 'controlStyle' ? save.settings.controlStyle !== 'joystick' : save.settings[k]; b.classList.toggle('on', !!on); if (k === 'controlStyle') { const f = save.settings.controlStyle !== 'joystick'; b.querySelector('span').textContent = 'Control style: ' + (f ? 'Follow finger' : 'Joystick'); } b.querySelector('b').textContent = k === 'pump' ? PUMP_LEVELS[pumpLevel(on)] : on ? 'ON' : 'OFF'; b.classList.toggle('on', k === 'pump' ? pumpLevel(on) > 0 : !!on); }
    $('bkCode').value = exportSave(save); paintCbStrip($('cbStrip'), kit, !!save.settings.colorBlind);
  };
  for (const b of document.querySelectorAll('#settings .tgl')) b.onclick = () => {
    const k = b.dataset.k; audio.unlock();
    if (k === 'controlStyle') { save.settings.controlStyle = save.settings.controlStyle === 'joystick' ? 'follow' : 'joystick'; fol.on = false; joy.on = false; joy.dx = 0; } else if (k === 'sound') save.muted = !save.muted; else if (k === 'pump') save.settings.pump = (pumpLevel(save.settings.pump) + 1) % 3; else save.settings[k] = !save.settings[k];
    applySettings(); resize(); persist(); audio.play('click'); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; paint();
  };
  { const vs = $('volRange'); if (vs) { vs.value = Math.round(save.settings.volume * 100); vs.oninput = () => { save.settings.volume = vs.value / 100; audio.setVolume(save.settings.volume); audio.unlock(); audio.play('slide', { f: save.settings.volume }); }; vs.onchange = () => { persist(); audio.unlock(); audio.play('tap'); }; } }
  { const ts = $('tsRange'), out = $('tsOut'); if (ts) { const cur = textScaleOf(save.settings); ts.value = Math.round(cur * 100); out.textContent = textScaleLabel(cur); ts.oninput = () => { const v = ts.value / 100; save.settings.textScale = v; save.settings.bigText = false; out.textContent = textScaleLabel(v); applyPageSettings(save.settings); if (R) R.setOptions({ textScale: v }); }; ts.onchange = () => { persist(); audio.unlock(); audio.play('tap'); }; } }
  $('bkCopy').onclick = async () => { const t = $('bkCode').value; try { await navigator.clipboard.writeText(t); toast('Code copied'); flashDone($('bkCopy'), 'COPIED'); } catch (e) { $('bkCode').select(); toast('Select and copy the code'); } };
  $('bkLoad').onclick = () => { const s2 = importSave($('bkCode').value); if (!s2) { toast('That code does not work'); return; } save = s2; persist(); applySettings(); refreshCur(); toast('Game loaded'); paint(); };
  $('setClose').onclick = () => { audio.play('click'); (back || (() => (mode === 'hub' ? openHub() : toTitle())))(); };
  paint(); bindSettingsFind($('settings')); show('settings');
}
function toggleMute() { save.muted = !save.muted; audio.setMuted(save.muted); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; persist(); }

// ---------------------------------------------------------------- result
function showRevive() {
  reviveAsked = true; const cost = reviveCost(g.revivesUsed);
  $('rvLeft').textContent = 'Remaining ×' + g.revivesLeft; $('rvGo').innerHTML = 'REVIVE  ' + cost + ' ' + curImg('sparkles'); $('rvGo').disabled = save.sparkles < cost;
  { const pc = Math.round((g.progress || 0) * 100), w = $('rvWipe'); if (w) { w.innerHTML = `<b>WIPEOUT!</b><span>${pc > 0 ? pc + '% of the serpent popped' : 'the serpent got through'}</span>${(dc => dc ? `<em>${dc.head}</em><small>${dc.sub}</small>` : '')(deathCauseOf(g))}<i><u style="width:${pc}%"></u></i>`; w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); } }
  $('rvInfo').innerHTML = reviveInfoHTML(g.stage, g.progress, save.sparkles, cost);
  let stopRing = () => {};
  $('rvGo').onclick = () => { if (save.sparkles < cost) return; stopRing(); stopFx(); save.sparkles -= cost; persist(); reviveGame(g); reviveAsked = false; endT = 0; audio.play('levelup'); show(''); };
  const giveUp = () => { stopRing(); stopFx(); g.revivesLeft = 0; reviveAsked = false; show(''); };
  $('rvNo').onclick = () => { audio.play('click'); giveUp(); };
  const timed = save.settings.reviveTimer !== false; $('rvTimer').textContent = timed ? 'Timer: ON' : 'Timer: OFF (take your time)';
  $('rvTimer').onclick = () => { audio.play('toggle'); save.settings.reviveTimer = !timed; persist(); stopRing(); stopFx(); showRevive(); };
  audio.duck(0.55, timed ? 10 : 3);   // the music sinks under the countdown heartbeat
  show('revive'); stopRing = reviveRing(timed ? 10 : 0, giveUp, { holdEls: [$('rvGo')], onBeat: n => { audio.play('heartbeat', { n }); buzz([30, 70, 22]); } });
  announce('Game over. The snake reached the line. Revive with ' + cost + ' sparkles, or give up. You have 10 seconds.');
}
function pauseRecap() {
  const pc = Math.floor((g.progress || 0) * 100), t = Math.floor(g.t || 0), mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  $('pRecap').innerHTML = `<div><i>${RECAP.flag}</i>Stage<b>${g.stage}</b></div><div><i>${RECAP.clock}</i>Time<b>${mm}:${ss}</b></div><div><i>${RECAP.target}</i>Popped<b>${g.kills}</b></div><div class="pbar"><i style="width:${pc}%"></i><em>${pc}% of the way</em></div>`;
  { const ll = lossLine(g); $('quitBtn').title = 'Ends the run: ' + ll.text; $('quitBtn').setAttribute('aria-label', 'Hold to give up. You would lose ' + ll.text); $('pLose').innerHTML = `<b>Giving up ends this run</b>${ll.text}`; }
  { const pb = pauseBuild(g.weap, save.loadout).filter(it => WEAPONS.some(x => x.id === it.id)); $('pBuild').innerHTML = pb.map(it => buildChipHTML(it, icon(it.id)).replace('<span class="pb9', '<span data-w="' + it.id + '" data-lv="' + it.lv + '" tabindex="0" role="button" class="pb9')).join('') + (pb.length ? `<em class="pb9n">${buildLine(pb)}</em>` : ''); $('pBuild').hidden = !pb.length; bindBuildChips($('pBuild'), id => chipStatsText(id, (g.weap[id] || {}).lv | 0, (save.skills[id] || {}).lv), () => audio.play('click')); $('pBuild').__reset10();
    const ps = document.querySelector('#pause .pnote'); if (ps) ps.textContent = pauseSub(g.stage, g.mode ? '' : stageInfo(g.stage).name); }
}
function showStatsFromPause() { statsPanel(() => show('pause')); }
function showStats() {
  if (mode !== 'play') return; mode = 'pause'; joy.on = false; fol.on = false; joy.dx = joy.dy = 0;
  statsPanel(() => { mode = 'play'; show(''); last = performance.now(); if (R && R.resumeFx) R.resumeFx(g); petsCall(); });
}
function statsPanel(onClose) {
  const tot = Object.values(g.dmgBy).reduce((a, v) => a + v, 0) || 1, rows = Object.entries(g.dmgBy).sort((a, b) => b[1] - a[1]);
  const nm = id => (id === 'capsule' ? 'Singing' : id === 'puppy' ? 'Puppy' : id === 'encore' ? 'Encore' : (WEAPONS.find(w => w.id === id) || { name: id }).name);
  hub2.openPanel('WHO DID WHAT', body => {
    body.innerHTML = rows.length ? rows.map(([id, v]) => `<div class="dmgrow"><span class="dn">${id === 'capsule' ? '🎤' : icon(id)} ${nm(id)}</span><div class="bar"><i style="width:${Math.round(v / tot * 100)}%"></i></div><b>${Math.round(v / tot * 100)}%</b></div>`).join('') : '<div class="sub">Nothing popped yet.</div>';
  }, onClose);
}
function flyRibbonsHome(nFly) {   // the result's Ribbons chip flies to the hub chip, which waits at the old total until it lands (batch 8)
  const rr = [...$('rList').children].find(c => /Ribbons/.test(c.textContent)), rn = rr ? +((rr.querySelector('[data-to]') || {}).dataset || {}).to || 0 : 0;
  if (rn <= 0) return;
  const rect = rr.getBoundingClientRect(), red = !!(save.settings.reduceMotion || systemReduceMotion());
  holdRibbons(Math.max(0, save.ribbons - rn));
  setTimeout(() => flyRibbons({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, rn, { reduce: red, onLand: () => { releaseRibbons(); refreshCur(); } }), 420 + 160 * nFly);
  setTimeout(() => { releaseRibbons(); refreshCur(); }, 3500);
}
function showResult() {
  const r = g.result; if (!r || ranResult) return; ranResult = true;
  const snap = keepSnap(save, dayKey()), li0 = levelInfo(save.xp), stk0 = stickerIds(save), out = applyResult(save, r); const g16 = finishGoals16(r); logRun(r); addRunStats(save, dayKey(), { ...r, kills: r.kills }); recordAddictRun(save, dayKey(), r); keepResult(snap, save, dayKey(), r, $('rKeep'), save.settings.reduceMotion); persist(); hub2.retain.checkAch(); audio.music(false); hub2.addict.renderResultNudge(r, out.prevPct);
  stopFx(); stopBest(); const cu = n => `+<span data-to="${n}">${n}</span>`;
  const rows = [`<div class="r">${curImg('beats')}${cu(out.beats)} Beats</div>`];
  if (out.ribbons) rows.push(`<div class="r">${BOW} ${cu(out.ribbons)} Ribbons</div>`);
  if (out.pet) rows.push(`<div class="r">${icon(out.pet.id)}${cu(out.pet.n)} ${PETS.find(p => p.id === out.pet.id).name} fragments</div>`);
  if (out.egg) rows.push(`<div class="r">${icon('egg')}+1 Egg</div>`);
  if (out.sparkles) rows.push(`<div class="r">${curImg('sparkles')}${cu(out.sparkles)} Sparkles</div>`);
  { const fk = Object.keys(out.frags);   // batch 10: two or more weapon fragments share one row (a lucky win used to push RETRY off the phone)
    if (fk.length > 1) rows.push(`<div class="r rfr10">${fk.map(id => `<span class="f10" title="${WEAPONS.find(w => w.id === id).name} fragment">${icon(id)}${cu(out.frags[id])}</span>`).join('')} fragments</div>`);
    else for (const id of fk) rows.push(`<div class="r">${icon(id)}${cu(out.frags[id])} ${WEAPONS.find(w => w.id === id).name} fragment</div>`); }
  $('rList').innerHTML = rows.join('');
  { const old = document.querySelector('.g16-chip'); if (old) old.remove(); const ch = g16 ? resultChipHTML(g16.res, g16.st) : ''; if (ch) $('rList').insertAdjacentHTML('afterend', ch); }
  $('rTitle').textContent = r.mode === 'inv' ? (r.won ? 'THE GIANT SERPENT BOWS!' : 'THE GIANT SERPENT WON') : r.mode === 'pig' ? (r.won ? 'PIGGY BANKS CRACKED!' : 'THE PIGGIES ESCAPED') : r.won ? 'STAGE CLEAR!' : r.name.toUpperCase() + ' WINS';
  $('rSub').textContent = r.won ? (out.first && r.stage === 1 ? 'Stage select unlocked! Pick any stage you have cleared, or the next one.' : r.name + ' is down.') : `You popped ${r.kills} ${r.kills === 1 ? 'cell' : 'cells'}. ${isUnlocked('stats', save) ? 'Spend your Beats in the hub and try again.' : 'Every pop counts. Try again!'}`;
  $('result').classList.toggle('won', !!r.won); { const cc = closeCall(r); $('result').classList.toggle('close', !!cc); if (cc) { $('rTitle').textContent = cc.title; $('rSub').textContent = cc.sub; } }
  announce((r.won ? 'Stage clear. ' : 'Game over. ') + $('rTitle').textContent + '. ' + r.kills + (r.kills === 1 ? ' cell' : ' cells') + ' popped, ' + out.beats + ' beats earned.');
  if (r.hard) hard = true;
  { const nmz = {}; for (const w of WEAPONS) nmz[w.id] = w.name; $('rHint').textContent = deathCoach(r, save) || lossHint(r, save.loadout, nmz); }
  if (out.levelUps) rows.push(`<div class="r">⭐ Level ${levelInfo(save.xp).lv}!</div>`);
  const li1 = levelInfo(save.xp), reduce = save.settings.reduceMotion;
  levelBar(li0, li1, reduce);
  if (out.levelUps && !reduce) setTimeout(() => { if (mode === 'over' && $('result').classList.contains('on')) levelUpJuice($('rLv'), li1.lv, audio); }, 1100);   // b13b: the badge pops once the bar has filled
  { const pct = Math.floor((r.progress || 0) * 100), best = out.first || out.starsGained > 0 || (!r.won && !r.mode && !r.hard && pct > out.prevPct && out.prevPct > 0);
    $('rRibbon').textContent = best ? (out.first ? 'FIRST CLEAR!' : out.starsGained > 0 ? 'NEW BEST STARS!' : 'NEW BEST ' + pct + '%') : ''; $('rRibbon').classList.toggle('on', !!best); celebrateBest($('rRibbon'), { reduce, delta: best && !out.first && !(out.starsGained > 0) ? pct - out.prevPct : 0, play: () => audio.play('star3') }); }
  if (r.cp50) rows.push(`<div class="r">⚡ +10 Voice back</div>`);
  $('rList').innerHTML = rows.join(''); countUp($('rList'), reduce, () => audio.play('countend'), f => audio.play('count', { f }));
  for (const el of $('rList').children) el.classList.add('got');
  progMeter($('rLevel'), !r.won && !r.mode && !r.hard ? Math.floor((r.progress || 0) * 100) : null, out.prevPct || 0, reduce);
  const pigRun = r.mode === 'pig' || r.mode === 'inv', nextOk = !pigRun && r.won && canPlay(save, r.stage + 1);
  $('rNext').style.display = nextOk ? '' : 'none'; $('rNext').classList.toggle('pulse', nextOk);
  $('rNext').onclick = () => { audio.play('click'); clearStickerPop(); beginStage(r.stage + 1); };
  $('rRetry').innerHTML = 'RETRY <span class="rcost">⚡' + ENERGY_COST + '</span>';
  { let gl = nextGoal(save); if (gl && !isTabUnlocked(gl.tab, save)) gl = null; renderGoal($('rGoal'), gl, () => { audio.play('click'); if (gl) openHub(gl.tab); }); }
  $('rShare').onclick = () => { audio.play('click'); shareResult(shareText(r, r.mode ? '' : stageInfo(r.stage).name, location.origin + location.pathname), toast); };
  $('rRetry').style.display = pigRun ? 'none' : '';
  $('rRetry').onclick = () => { audio.play('click'); clearStickerPop(); try { retryFly($('rRetry'), rewardSnaps($('rList')), !!(save.settings.reduceMotion || systemReduceMotion())); } catch (e) { /* cosmetic */ } beginStage(r.stage); };
  $('rHub').onclick = () => { audio.play('click'); curtainClose(document.documentElement.classList.contains('rm'), () => { clearStickerPop(); const fl = rewardSnaps($('rList')); flyRibbonsHome(fl.length); if (!pigRun) sel = r.won ? Math.min(r.stage + 1, save.cleared + 1) : r.stage; gigFlies(fl.map(it => ({ snap: it.s, kind: it.kind, amt: it.n })), 420); openHub('Battle'); }); };   // the hub pills wait at their old totals and count up as each chip lands (batch 7)
  { const st = r.stars || 0; $('rStars').innerHTML = r.won && !r.mode && !r.hard ? [1, 2, 3].map(i => `<span class="${i <= st ? '' : 'off'}">★</span>`).join('') : '';
    if ($('rStars').children.length) revealStars($('rStars'), st, i => { audio.play('star' + Math.min(3, i + 1)); if (i === st - 1 && !reduce) confetti($('result'), st === 3 ? 30 : st === 2 ? 18 : 10); }, reduce);
    const mm = Math.floor((r.time || 0) / 60), ss = String(Math.floor((r.time || 0) % 60)).padStart(2, '0');
    const top = Object.entries(r.dmgBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => (id === 'capsule' ? 'Singing' : id === 'encore' ? 'Encore' : (WEAPONS.find(w => w.id === id) || { name: id }).name)).join(', ') || '-';
    $('rExtra').innerHTML = `<span><i>⏱</i>Time <b>${mm}:${ss}</b></span><span><i>🎯</i>Cells <b>${r.kills}</b></span><span><i>🎵</i>Best groove <b>${Math.round(r.groove || 0)}</b></span>${(r.qBest | 0) >= 1 && !(r.bombs | 0) ? `<span><i>🎶</i>Quartets <b>${r.quartets | 0}${r.qBest >= 2 ? ' (x' + r.qBest + ')' : ''}</b></span>` : `<span><i>💣</i>Bombs <b>${r.bombs || 0}</b></span>`}<span class="rtop"><i>🏆</i>Top <b>${top}</b></span>${(ml => ml ? `<span class="rtop rbm"><i>✨</i>Moment <b>${ml}</b></span>` : '')(momentLine(R && R.hj && R.hj.moment && R.hj.moment()))}`;

    { const bm = bestMoment(r), fi = bm && bm.kind === 'finish' && WEAPONS.some(w => w.id === bm.src) ? icon(bm.src) : ''; showMoment($('rMoment'), bm, fi); }
    // no toast here: it used to cover the title on the result screen, and the ribbon plus the Sparkles row already say it
  }
  { const rd = !!(save.settings.reduceMotion || systemReduceMotion()); setTimeout(() => shineStars($('rStars'), out.starsGained, rd), 900 + (r.stars || 0) * 260);
    markStickersSeen(save); showStickerPop(newStickers(stk0, stickerIds(save)), { reduce: rd, valid: () => mode === 'over' && $('result').classList.contains('on'), onLand: bumpStatsTab }); }
  if (r.won && (out.first || out.starsGained > 0)) setTimeout(() => audio.play('stinger'), 200); else if (r.won && r.mode) audio.play('win');
  if (!r.mode) { const wsk = stageInfo(r.stage).skin, wn = !!r.won; setTimeout(() => { if (mode === 'over' && $('result').classList.contains('on')) audio.play('worldmotif', { skin: wsk, won: wn }); }, wn ? 900 : 450); }   // b14e: a short motif per world
  try { dressDuo($('rImg'), { outfit: wornOutfit(save), pets: save.petEquip, kit, mood: r.won ? 'win' : 'lose', joy: Object.fromEntries(save.petEquip.map(id => [id, save.pets[id].joy || 0])) }); } catch (e) { /* ignore */ }
  show('result'); mode = 'over';
}

// one delegated listener picks the UI sound by element: tabs, back/close, toggles, plain taps; disabled buttons deny
const BACKIDS = new Set(['setClose', 'pClose', 'rvNo', 'bOk', 'rHub', 'stPrev']);
document.addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('button'); if (b && b.disabled && b.classList.contains('btn')) audio.play('deny'); }, true);
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled) return;
  audio.unlock();
  audio.play(b.closest('.tabs') ? 'tab' : b.classList.contains('tgl') ? 'toggle' : BACKIDS.has(b.id) || b.dataset.sfx === 'back' ? 'back' : 'tap');
}, true);

// ---------------------------------------------------------------- loop
const SFX = { lull: 'levelup', surgewarn: 'swarm', surge: 'roar', phase2: 'roar', won: 'clear', chestdrop: 'power', chest: 'levelup', upgradecell: 'cell', groove: 'groovehit', leak: 'leak', swab: 'meow', needles: 'squeak', dragon: 'coo', maw: 'bark', strike: 'hoot', bubble: 'quack', pulse: 'moo' };
const PETSND = { kitten: 'meow', puppy: 'bark', lamb: 'baa', turtle: 'boop', piglet: 'oink', hamster: 'squeak' };
const BUZZ = { dead: [80, 40, 90], revive: 40, boom: 24, upgradecell: 16, levelup: [14, 24, 20, 24, 40], chest: [10, 30, 14, 30, 36], danger: 28, leak: 60 };
const FX_SOUND = new Set(['shoot', 'hit', 'kill', 'boom', 'coin', 'hurt', 'block', 'power', 'levelup', 'clear', 'stage', 'revive', 'dead', 'swarm', 'roar', 'surgewarn', 'surge', 'phase2', 'won', 'chestdrop', 'chest', 'swab', 'needles', 'dragon', 'maw', 'strike', 'bubble', 'pulse', 'danger', 'mend', 'lull', 'skip', 'upgradecell', 'groove', 'leak', 'beatshot', 'encore', 'encoreready', 'goldpop', 'goldfade', 'quartet', 'quartetstart', 'quartetfail', 'clutch', 'checkpoint', 'gloom', 'nap', 'pillow', 'shell', 'metro', 'soundcheck']);
let hitSrc = '', hitAt = 0;
const now8 = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function drain(game, sound) {
  const evs = game.events;   // read in place and truncate at the end: no new array every frame (events pushed meanwhile are still handled)
  try { for (let ei = 0; ei < evs.length; ei++) {
    const e = evs[ei];
    R.onEvent(e, game); if (game === g) momentEvent(e, game);
    if (sound && e.t === 'kill' && game === g && needsFirstPop(save)) firstPop(audio, buzz);
    if (sound && e.t === 'kill' && e.choir) audio.play('choirpop');
    if (sound && e.t === 'shoot' && game.ring) e.pan = panOf(game.p.aim);   // b12: ring shots pan with the aim
    if (sound && e.t === 'kill' && e.head && e.boss) audio.play('bosscrown');
    if (sound && e.t === 'won' && game === g && isMilestone(game.stage)) audio.play('milestone');
    if (sound && e.t === 'hit') { hitSrc = e.src || ''; hitAt = now8(); }   // audio round 8: remember the weapon that landed the last hit
    if (sound && e.t === 'kill' && e.head && !e.boss) audio.play('finishblow', { src: now8() - hitAt < 250 ? hitSrc : '' });
    if (sound && e.t === 'stage' && game.skin) e.skin = game.skin;   // the stage card sting is per species
    if (sound && (e.t === 'snack' || e.t === 'snackget' || e.t === 'snackgone' || e.t === 'startle' || e.t === 'ringskip')) audio.play(e.t === 'snack' ? 'snackdrop' : e.t, e);
    if (sound && (e.t === 'mirror' || e.t === 'beatrun' || e.t === 'btwist')) audio.play(e.t, e);
    if (sound && (e.t === 'bell' || (e.t === 'trait' && !e.warn))) audio.play(e.t === 'bell' ? 'bellring' : 'traitcue', e);
    if (!sound) continue;
    if (FX_SOUND.has(e.t)) audio.play(SFX[e.t] || e.t, e); else if (e.t === 'pet') audio.play(PETSND[e.id] || 'chirp');
    if (BUZZ[e.t] !== undefined) buzz(BUZZ[e.t]);
  } } finally { evs.length = 0; }
}
let pauseN = 0, pauseW = 0, pauseH = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  if (!R) return;
  audio.muffle(wantsMuffle(mode, g));
  if (mode === 'play') {
    const ms = dt * 1000;
    if (ms > 26) { slowFrames++; fastFrames = 0; } else if (ms < 19) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
    if (slowFrames > 45 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); slowFrames = 0; resize(); }
    else if (slowFrames > 90 && dprCap <= 1 && !save.settings.lowQuality) { save.settings.lowQuality = true; R.setOptions({ lowQuality: true }); toast('Low quality turned on to keep it smooth'); persist(); }
    else if (fastFrames > 600 && dprCap < 2) { dprCap = Math.min(2, dprCap + 0.5); fastFrames = 0; resize(); }
  }
  if (mode === 'hub') { audio.hubWorld(skinFor(sel)); if (hubTab === 'Battle') drawPreview(now / 1000); return; }   // the hub covers the game: draw only the stage picture
  if (mode === 'title') {
    acc += dt; while (acc >= 1 / 60) { acc -= 1 / 60; step(demo, 1 / 60, botInput(demo)); if (demo.phase === 'levelup') choose(demo, 0); }
    if (demo.phase === 'dead' || demo.phase === 'won') newDemo();
    drain(demo, false); R.draw(demo, null, dt);
    return;
  }
  if (mode === 'play') {
    clk.feed(dt, R.timeScale());   // slow motion on the last cell / boss face
    while (clk.take()) { step(g, 1 / 60, readInput()); if (g.phase === 'levelup' || g.phase === 'dead' || g.phase === 'won') { clk.drop(); break; } }   // never bank time while the sim waits (cards, game over)
    if (g.phase === 'levelup' && cardsFor !== g.choices) showCards();
    if (g.phase === 'dead' || g.phase === 'won') { endT += dt; if (endT > (g.phase === 'dead' ? 1.1 : 0.5) && !(g.phase === 'won' && R.clearBusy())) { if (g.phase === 'dead' && g.revivesLeft > 0 && !reviveAsked && !(!isUnlocked('sparkles', save) && save.sparkles < reviveCost(g.revivesUsed))) showRevive();   /* b13a: a fresh account with no Sparkles skips the revive card it cannot use */ else if (!reviveAsked) showResult(); } }
    if (watchGroove(g.groove) < 0) audio.play('groovelost');
    watchStreak(audio.beatStreak); if (g.phase === 'play') audio.chainWatch();
    audio.intensity(g.snakes.length ? Math.min(1, g.stage / 12) : 0); audio.mix({ stage: g.stage, boss: isBossStage(g.stage), groove: g.groove / 20, danger: g.danger, skin: cues.skin(g), bphase: cues.tick(g), combo: g.t - g.lastKill < 2.2 ? g.combo : 0 });
    if (g.phase === 'play') audio.sync(beatPhase(g));
  }
  if (mode === 'pause') { if (pauseN > 2 && pauseW === canvas.width && pauseH === canvas.height) return; pauseN++; pauseW = canvas.width; pauseH = canvas.height; } else pauseN = 0;   // a paused picture is frozen: draw it a few times (and again after a resize), then leave the canvas alone
  if (g) { drain(g, mode === 'play'); const dt0 = performance.now(); R.draw(g, { joy, fol: fol.on && followMode() ? fol : null, hints: save.runs < 2, aimHint }, mode === 'pause' ? 0 : dt); if (mode === 'play' && g.phase === 'play') governDraw(performance.now() - dt0);
    if (mode === 'play') for (const n of R.takeSounds()) audio.play(n); else R.takeSounds(); }
}

// ---------------------------------------------------------------- wiring
$('playBtn').onclick = () => { audio.unlock(); audio.play('click'); playBurst($('playBtn')); if (save.runs === 0) { if (needsTutorial(save)) showTutorial(() => startRun(1), audio, kit, art); else startRun(1); } else openHub('Battle'); };
$('resumeBtn').onclick = () => resume();
$('pStats').onclick = () => { audio.play('click'); showStatsFromPause(); };
$('pSet').onclick = () => { audio.play('click'); openSettings(() => show('pause')); };
const quitNow = () => {
  g.p.hp = 0; g.phase = 'dead';
  g.result = quitResult(g);
  showResult();
};
trackModality();
const quitHold = holdConfirm($('quitBtn'), { ms: 900, onConfirm: () => { audio.play('click'); buzz([40, 30, 40]); quitNow(); }, onHint: k => toast(k === 'again' ? 'Press again to give up' : 'Hold to give up') });

$('setBtnT').onclick = () => { audio.unlock(); audio.play('click'); openSettings(() => toTitle()); };
$('setBtnH').onclick = () => { audio.unlock(); audio.play('click'); openSettings(() => openHub()); };
$('muteBtn').onclick = toggleMute;
for (const [id, label] of [['muteBtn', 'Mute'], ['enPlus', 'Buy Voice'], ['stPrev', 'Previous stage'], ['stNext', 'Next stage']]) $(id).setAttribute('aria-label', label);
addEventListener('error', () => { toast('Something glitched. Your save is safe.'); if (mode === 'play') pause(); }); $('muteBtn').textContent = save.muted ? '🔇' : '🔊';

window.CS = { perf: () => ({ drawMs, autoLow, autoFlips }), govern: governDraw, unlockAll: (v = true) => { setUnlockAll(v); if (mode === 'hub') renderHub(); }, unlockUI, fold: foldHook, motion, momentEvent, g: null, get hub2() { return hub2; }, save: () => save, mode: () => mode, openHub, startRun,
  // QA hook (batch 5): jump the live run to its end the way the sim does ('dead' | 'won'), then the normal flow (revive prompt, result) takes over
  force: kind => { if (mode !== 'play' || !g || g.phase === 'dead' || g.phase === 'won') return false; if (kind === 'dead') { g.p.hp = 0; g.p.revive = 0; g.phase = 'dead'; g.result = quitResult(g); g.events.push({ t: 'dead' }); return true; } if (kind === 'won') { g.snakes = []; g.phase = 'won'; g.result = { ...quitResult(g), won: true, stars: g.mode || g.hard ? 0 : 3 }; g.events.push({ t: 'won' }); return true; } return false; } };
loadArt('assets/').then(a => {
  art = a; kit = createArtDraw((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, 2); applyCbPalette(kit, !!save.settings.colorBlind);
  for (const im of document.querySelectorAll('img[data-cur]')) im.src = iconURL(im.dataset.cur);
  // title decoration: snake heads in four colours
  [['love', 'deco1'], ['grumpy', 'deco2'], ['sneezy', 'deco3'], ['sleepy', 'deco4']].forEach(([skin, el], i) => {
    const c = document.createElement('canvas'); c.width = c.height = 220; kit.drawHead(c.getContext('2d'), 110, 110, 62, i % 2 ? Math.PI : 0, { skin, t: 1 + i, look: [0, 1] }); $(el).src = c.toDataURL();
  });
  setupPeeks($('peeks'), kit); setupTitleSnake($('title'), kit); setupTune($('title'), audio, () => { save.sparkles += 3; persist(); refreshCur(); toast('Sticker! +3 Sparkles'); }); setupSecrets($('title'), audio); setupTitle10($('title'), audio); setupTitle11($('title')); $('title').addEventListener('snakepoke', e => (e.detail && e.detail.hit ? audio.play('snakesqueak', e.detail) : audio.play('click'))); tagPets($('peeks'), ['kitten', 'puppy', 'piglet', 'lamb', 'hamster', 'turtle']); setupTapAnimals($('peeks'), audio); setupTitleLife($('notes12'), document.querySelector('#title .tagline'));
    onTabUp(() => audio.play('tabping')); onCurtain(() => audio.play('curtain')); R = createRenderer(canvas, art, kit); R.setBeat(() => audio.beat()); window.CS.art = art; window.CS.R = R; R.setOptions({ onReady: () => audio.play('ready'), onMilestone: n => audio.play('streakmile', { n }), onPetCall: id => audio.play('petcall', { id }), onPetGlance: () => audio.play('petglance'), onPounce: () => audio.play('pounce'), beatStreak: () => audio.beatStreak }); applySettings(); resize(); refreshTitle();
  warmIdle([...['beats', 'sparkles', 'egg', 'chest', 'boxbeat', 'boxspark', 'aspd', 'notes', 'burst', 'cdmg'], ...WEAPONS.map(w => w.id), ...PETS.map(p => p.id)].map(id => () => iconURL(id)).concat(SIDE_ICON_NAMES.map(n => () => sideIconURL(n))));   // 11-perf: icon PNGs encode in idle time
  const qs = new URLSearchParams(location.search);
  newDemo(); refreshCur();
  if (qs.get('stage')) { startRun(Math.max(1, +qs.get('stage'))); }   // dev shortcut: ?stage=N
  else show('title');
  last = performance.now(); requestAnimationFrame(frame);
});
