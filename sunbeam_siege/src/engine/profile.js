/* SUNBEAM SIEGE: profile wrapper (agent C2).
 * Classic script. SB.profile is a thin, cached layer over SB.data.meta (Whisker XP, unlocks, cosmetics, settings).
 * Storage failures never throw: the profile simply lives in memory for the session.
 * No em dashes anywhere.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  var P = SB.profile = SB.profile || {};
  var cache = null, lastStatus = 'new';
  function M() { return SB.data.meta; }

  P.load = function (force) {
    if (cache && !force) return cache;
    var r = M().load();
    cache = r.profile; lastStatus = r.status;
    P.rawCorrupt = r.status === 'corrupt' ? r.raw : null;
    return cache;
  };
  P.get = function () { return P.load(); };
  P.status = function () { P.load(); return lastStatus; };
  P.save = function () { if (!cache) return false; return M().save(cache); };
  P.reset = function () { cache = M().newProfile(Date.now()); P.save(); return cache; };
  P.syncUnlocks = function () { var f = M().syncUnlocks(P.load()); if (f.length) P.save(); return f; };
  P.isUnlocked = function (kind, id) {
    var p = P.load();
    var bucket = { clan: 'clans', champion: 'champions', relic: 'relics', gift: 'gifts', coat: 'coats', collar: 'collars' }[kind];
    if (!bucket) return false;
    return p.unlocked[bucket].indexOf(id) >= 0;
  };
  P.unlockedList = function (kind) {
    var bucket = { clan: 'clans', champion: 'champions', relic: 'relics', gift: 'gifts', coat: 'coats', collar: 'collars' }[kind];
    return bucket ? P.load().unlocked[bucket].slice() : [];
  };
  P.isRelicAvailable = function (relicId) { return M().isRelicAvailable(P.load(), relicId); };
  // record a finished run summary (from SB.run.summary). Returns the meta report.
  P.recordRun = function (summary, now) {
    var p = P.load();
    var report = M().recordRun(p, summary, now || Date.now());
    P.save();
    return report;
  };
  P.xpInfo = function () {
    var p = P.load(), x = M().xp;
    var lvl = x.fromXp(p.xp);
    return { xp: p.xp, level: p.level, info: lvl, maxLevel: M().maxLevel };
  };
  /* cosmetics: equipped coat and collar, per champion with a default fallback */
  P.cosmetics = function (championId) {
    var p = P.load(), e = p.equipped;
    return (championId && e.byChampion && e.byChampion[championId]) || e['default'];
  };
  P.equip = function (slot, id, championId) {
    var p = P.load();
    var bucket = slot === 'coat' ? 'coats' : 'collars';
    if (p.unlocked[bucket].indexOf(id) < 0) return false;
    if (championId) { p.equipped.byChampion[championId] = Object.assign({}, p.equipped.byChampion[championId] || p.equipped['default']); p.equipped.byChampion[championId][slot] = id; }
    else p.equipped['default'][slot] = id;
    P.save();
    return true;
  };
  P.settings = function () { return P.load().settings; };
  P.setSetting = function (key, value) { P.load().settings[key] = value; P.save(); };
  P.setLoadout = function (loadout) { var p = P.load(); Object.assign(p.loadoutLast, loadout || {}); P.save(); };
  P.selectedRank = function () { var p = P.load(); return Math.min(p.mischief.selected, p.mischief.unlocked); };
  P.exportText = function () { return M().exportProfile(P.load()); };
  P.importText = function (text) {
    var p = M().importProfile(text);
    if (!p) return false;
    cache = p; P.save(); return true;
  };
})();
