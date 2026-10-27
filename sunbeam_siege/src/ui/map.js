/* Map screen (C4): the 5 x 8 node map per act, drawn bottom (Evening) to top (boss).
 *   SB.ui.mapView(host, run, {interactive, onPick}) renders the map into any element (screen, dialog, tutorial).
 *   Node ids come from SB.map ("a1r0c2"); rows are 0 based, row 7 is the boss. No em dashes. */
(function () {
  'use strict';
  var K = SB.ui.kit, h = K.h, scope = null;

  var ACTS = [
    { name: 'The Cellar and the Garden', tag: 'Damp, small, full of mice with big ideas.', cls: 'a1' },
    { name: 'The Parlor', tag: 'Domestic menace. Appliances and sprays.', cls: 'a2' },
    { name: 'The Attic and the Roof', tag: 'Dusty, high, strange. Weather and the uncatchable.', cls: 'a3' }
  ];
  var TYPES = {
    battle: { name: 'Prowl', icon: 'battle', desc: 'A three wave fight. Reward: Fish and a card draft.' },
    night: { name: 'Night Battle', icon: 'night', desc: 'A four wave fight under a Night Omen. Reward: Fish, a card draft, and a Collar Charm or champion upgrade.' },
    elite: { name: 'Elite', icon: 'elite', desc: 'A hard four wave fight with an Elite pest. Guaranteed relic.' },
    shop: { name: 'Gerald\'s Bazaar', icon: 'shop', desc: 'A raccoon in a coat sells cards, relics and services. He insists he is a tall cat.' },
    event: { name: 'Event', icon: 'event', desc: 'Something happens. You choose how to feel about it.' },
    post: { name: 'Scratching Post', icon: 'post', desc: 'Upgrade a card. Preview before you commit.' },
    nook: { name: 'Nap Nook', icon: 'nook', desc: 'Rest, knead, or groom. All better than a fight.' },
    treasure: { name: 'Treasure', icon: 'treasure', desc: 'A cardboard box. Open it for a relic, or sit in it.' },
    mystery: { name: 'Mystery', icon: 'mystery', desc: 'Resolves when you arrive. Could be anything. Probably a fight.' },
    boss: { name: 'Boss', icon: 'boss', desc: 'The act boss. Bring a plan.' }
  };
  var ROW_NAMES = ['Evening', 'Evening', 'Night', 'Small hours', 'Small hours', 'Night', 'Before dawn', 'Boss'];
  K.nodeTypes = TYPES;

  function nodeOf(run, id) { return run.map && run.map.nodes && run.map.nodes[id]; }
  function visitedSet(run) {
    var s = {}, arr = run.visited || run.path || run.trail || [];
    arr.forEach(function (id) { s[id && id.id || id] = 1; });
    if (run.pos) s[run.pos] = 1;
    return s;
  }
  function jit(id, k) { return ((K.hash(id + k) % 1000) / 1000 - 0.5); }
  function pos(node, cols, rows) {
    var col = node.c != null ? node.c : node.col, row = node.r != null ? node.r : node.row;
    var x = (col + 0.5) / cols * 100 + jit(node.id, 'x') * 5, y = ((rows - 1 - row) + 0.5) / rows * 100 + jit(node.id, 'y') * 3;
    if (row === rows - 1) { x = 50; y = ((rows - 1 - row) + 0.62) / rows * 100; }
    return { x: x, y: y };
  }
  function omenDef(id) { return id ? (SB.data.meta.omens || []).find(function (o) { return o.id === id; }) : null; }
  function bossDef(id) { return id ? K.pestDef(id) : null; }
  function revealed() { return true; }
  function typeKey(run, node) { return node.type === 'elite' && !revealed(run, node) ? 'night' : node.type; }

  // ------------------------------------------------------------------ node info sheet
  function nodeSheet(run, node, avail, onGo) {
    var key = typeKey(run, node), T = TYPES[key] || TYPES.battle, rev = revealed(run, node);
    var body = h('div.col', { style: 'gap:10px' });
    var head = h('div.row.gap-s', { style: 'align-items:flex-start' }, h('div.node-ico.big.t-' + key, K.icon(T.icon, 34)), h('div.grow', h('div', { style: 'font-weight:900;font-size:calc(18px*var(--text-scale));font-family:var(--f-display);text-transform:uppercase;color:var(--sunbeam)' }, node.type === 'boss' ? (bossDef(node.bossId || run.map.boss) || { name: 'Boss' }).name : T.name), node.nightNo ? h('div.dim', 'Night ' + node.nightNo + ' of 9') : null));
    body.appendChild(head); body.appendChild(h('p', { style: 'line-height:1.4' }, T.desc));
    var om = rev && omenDef(node.omen);
    if (om) body.appendChild(h('div.panel.tight', h('div', { style: 'font-weight:800;color:var(--sunbeam)' }, 'Omen: ' + om.name), h('div', { style: 'font-size:calc(13px*var(--text-scale))' }, om.text), h('div.faint', { style: 'font-style:italic;font-size:12px;margin-top:2px' }, om.flavor)));
    if (node.type === 'boss') {
      var bd = bossDef(node.bossId || run.map.boss);
      if (bd) { body.appendChild(h('div.row.gap-s', { style: 'align-items:flex-end' }, K.staticPest(bd, 2), h('div.dim', { style: 'font-size:13px;line-height:1.35' }, bd.mechanic && bd.mechanic.text || bd.flavor || ''))); }
    }
    var d, foot = [K.btn(avail ? 'Not yet' : 'Close', { kind: 'alt', onClick: function () { d.close(); } })];
    if (avail) foot.push(K.btn('Go here', { icon: 'paw', tut: 'confirmNode', onClick: function () { d.close(); onGo(node); } }));
    d = K.dialog({ title: avail ? 'Go here?' : 'On the map', body: body, footer: foot, sheet: true });
  }

  // ------------------------------------------------------------------ the map renderer
  SB.ui.mapView = function (host, run, o) {
    o = o || {};
    var map = run.map; if (!map) { host.appendChild(h('p.dim', 'No map yet.')); return; }
    var cols = map.cols || 5, rows = (map.rows && map.rows.length) || 8;
    var avail = {}; (o.available || (SB.run && SB.run.availableNodes ? SB.run.availableNodes(run) : [])).forEach(function (id) { avail[id] = 1; });
    var vis = visitedSet(run), cur = run.pos;
    var act = map.act || run.act || 1, A = ACTS[act - 1] || ACTS[0];
    var wrap = h('div.mapv.' + A.cls + (o.interactive ? '.live' : '.ro'), { 'data-tut': 'mapPath' });
    var rowH = o.rowH || null; if (rowH) wrap.style.setProperty('--rowh', rowH + 'px');
    // backdrop decoration
    wrap.appendChild(h('div.mapv-bg'));
    // row labels
    var labels = h('div.mapv-labels');
    for (var r = 0; r < rows; r++) {
      var nn = null; Object.keys(map.nodes).forEach(function (id) { var n = map.nodes[id]; if ((n.r != null ? n.r : n.row) === rows - 1 - 0 && false) nn = n; });
      labels.appendChild(h('div.rl', { style: 'top:' + (((rows - 1 - r) + 0.5) / rows * 100) + '%' }, ROW_NAMES[r] || ''));
    }
    wrap.appendChild(labels);
    // edges
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'mapv-edges'); svg.setAttribute('aria-hidden', 'true');
    (map.edges || []).forEach(function (e) {
      var a = nodeOf(run, e[0]), b = nodeOf(run, e[1]); if (!a || !b) return;
      var pa = pos(a, cols, rows), pb = pos(b, cols, rows), ym = (pa.y + pb.y) / 2;
      var taken = vis[a.id] && vis[b.id], live = cur === a.id && avail[b.id] || (cur == null && false);
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M' + pa.x + ' ' + pa.y + ' C' + pa.x + ' ' + ym + ' ' + pb.x + ' ' + ym + ' ' + pb.x + ' ' + pb.y);
      p.setAttribute('class', 'edge' + (taken ? ' taken' : '') + (live ? ' live' : ''));
      svg.appendChild(p);
    });
    wrap.appendChild(svg);
    // nodes
    var layer = h('div.mapv-nodes');
    Object.keys(map.nodes).forEach(function (id) {
      var n = map.nodes[id], key = typeKey(run, n), T = TYPES[key] || TYPES.battle, P = pos(n, cols, rows);
      var isAvail = !!avail[id] && o.interactive !== false && !!o.interactive, isCur = cur === id, isVis = !!vis[id] && !isCur;
      var cls = 'mnode t-' + key + (isAvail ? ' avail' : '') + (isCur ? ' cur' : '') + (isVis ? ' vis' : '') + (n.type === 'boss' ? ' boss' : '') + (!isAvail && !isVis && !isCur ? ' far' : '');
      var label = (n.type === 'boss' ? ((bossDef(n.bossId || map.boss) || {}).name || 'Boss') : T.name) + (n.nightNo ? ', Night ' + n.nightNo : '') + (isAvail ? ', available' : isVis ? ', visited' : isCur ? ', current' : '');
      var b = h('button.' + cls.split(' ').join('.'), { type: 'button', id: 'node-' + id, style: 'left:' + P.x + '%;top:' + P.y + '%', 'aria-label': label, 'data-tut': 'mapNode:' + id, 'data-node': id });
      var ico;
      if (n.type === 'boss') {
        var bd = bossDef(n.bossId || map.boss); ico = h('div.node-ico.t-boss', bd ? K.staticPest(bd, 1) : K.icon('boss', 30));
      } else ico = h('div.node-ico.t-' + key, K.icon(T.icon, 26));
      b.appendChild(ico);
      if (n.nightNo) b.appendChild(h('span.nn', String(n.nightNo)));
      if (isVis) b.appendChild(h('span.pawmark', K.icon('paw', 12)));
      if (isCur) { var cc = h('span.catmark'); cc.appendChild(K.cat('title_roof_cat', { scale: 1 })); b.appendChild(cc); }
      if (n.omen && !isVis) { var om = omenDef(n.omen); if (om) b.appendChild(h('span.omen', K.icon('night', 10))); }
      K.tip(b, function () { var t = '<b style="color:var(--sunbeam)">' + K.esc(n.type === 'boss' ? ((bossDef(n.bossId || map.boss) || {}).name || 'Boss') : T.name) + '</b>' + (n.nightNo ? ' (Night ' + n.nightNo + ')' : ''); var om2 = revealed(run, n) && omenDef(n.omen); if (om2) t += '<br>Omen: ' + K.esc(om2.name); return t; });
      b.addEventListener('click', function () {
        K.click();
        if (o.onNode) { o.onNode(n, isAvail); return; }
        nodeSheet(run, n, isAvail, function (nn2) { if (o.onPick) o.onPick(nn2); });
      });
      layer.appendChild(b);
    });
    wrap.appendChild(layer);
    host.appendChild(wrap);
    return wrap;
  };

  function legend() {
    var keys = ['battle', 'night', 'elite', 'shop', 'event', 'post', 'nook', 'treasure', 'mystery', 'boss'];
    return h('div.maplegend', { 'data-tut': 'mapLegend' }, keys.map(function (k) { return h('div.lg', h('div.node-ico.sm.t-' + k, K.icon(TYPES[k].icon, 16)), h('span', TYPES[k].name.replace('Gerald\'s Bazaar', 'Shop'))); }));
  }

  function mount(root, params) {
    scope = K.scope();
    var run = params.run || SB.ui.flow.run;
    if (!run || !run.map) { var inner0 = K.scaffold(root, ''); inner0.appendChild(h('p.dim', 'No run in progress.')); inner0.appendChild(K.btn('Title', { onClick: function () { SB.ui.flow.toTitle(); } })); return; }
    var inner = K.scaffold(root, 'wide mapscreen');
    var act = run.map.act || run.act || 1, A = ACTS[act - 1] || ACTS[0];
    var tutorial = !!run.tutorial;
    inner.appendChild(h('div.map-banner.' + A.cls, h('div.dim', { style: 'font-size:11px;letter-spacing:.14em;text-transform:uppercase' }, 'Act ' + act + ' of 3'), h('h1.screen-title', { style: 'font-size:calc(22px*var(--text-scale))' }, A.name), h('div.dim', { style: 'font-size:13px' }, A.tag),
      h('span.spacer')));
    var host = h('div.mapv-host');
    var side = h('aside.map-side');
    var deckN = (run.deck || []).length;
    side.appendChild(h('div.panel.pad', h('h3', 'Your clowder'),
      h('div.col', { style: 'gap:6px' },
        h('div.pv-line', h('span.dim', 'Cards'), h('b.num', String(deckN))),
        h('div.pv-line', h('span.dim', 'Relics'), h('b.num', String((run.relics || []).length))),
        h('div.pv-line', h('span.dim', 'Warmth'), h('b.num', (run.warmth || 0) + '/' + (run.maxWarmth || 40))),
        h('div.pv-line', h('span.dim', 'Fish'), h('b.num', { style: 'color:var(--fish)' }, String(run.fish || 0)))),
      h('div.row.gap-s', { style: 'margin-top:10px' }, K.btn('Deck', { kind: 'alt small', icon: 'deck', onClick: function () { SB.ui.openDeck(run); } }), K.btn('Relics', { kind: 'alt small', icon: 'relic', onClick: function () { SB.ui.openRelics(run); } }))));
    var lg = h('div.panel.pad.legend-panel', h('h3', 'Legend'), legend());
    side.appendChild(lg);
    var chipToggle = h('button.btn.alt.small.legend-toggle', { type: 'button', 'aria-expanded': 'false', on: { click: function () { var ex = lg.classList.toggle('open'); chipToggle.setAttribute('aria-expanded', String(ex)); } } }, K.icon('map', 16), 'Legend');
    inner.appendChild(h('div.map-cols', h('div.map-main', host, h('div.row', { style: 'justify-content:center;margin-top:8px' }, chipToggle)), side));
    var avail = SB.run && SB.run.availableNodes ? SB.run.availableNodes(run) : [];
    var info = h('p.map-hint.dim.center', avail.length ? 'Tap a glowing node to choose your path.' : 'Nothing reachable. Something is wrong with the map.');
    inner.insertBefore(info, inner.querySelector('.map-cols'));
    SB.ui.mapView(host, run, { interactive: true, available: params.available, onPick: function (node) { SB.ui.flow.chooseNode(node.id); } });
    // on small screens the map is taller than the view: bring the live node into the lower middle
    var focus = (avail[0] && host.querySelector('[data-node="' + avail[0] + '"]')) || (run.pos && host.querySelector('[data-node="' + run.pos + '"]'));
    var sc = root.querySelector('.sc');
    if (focus && sc) scope.timeout(function () {
      if (sc.scrollHeight <= sc.clientHeight + 4) return;
      var fr = focus.getBoundingClientRect(), sr = sc.getBoundingClientRect();
      sc.scrollTop = Math.max(0, sc.scrollTop + (fr.top - sr.top) - sc.clientHeight * 0.62);
    }, 30);
    if (SB.tutorial && SB.tutorial.onMapShown) scope.timeout(function () { SB.tutorial.onMapShown(run, root); }, 120);
    SB.ui.topbar.refresh();
  }
  K.register('map', { mount: mount, unmount: function () { if (scope) scope.dispose(); scope = null; } });
})();
