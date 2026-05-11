// UI windows + notifications.

let nextWinId = 1;

export function notify(state, text, kind = 'info') {
  const host = document.getElementById('notifications');
  if (!host) return;
  const div = document.createElement('div');
  div.className = `notif ${kind}`;
  div.textContent = text;
  host.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity 0.4s'; }, 4000);
  setTimeout(() => div.remove(), 4500);
}

export function openWindow(state, opts) {
  const host = document.getElementById('window-host');
  const id = `win-${nextWinId++}`;
  const w = document.createElement('div');
  w.className = 'win';
  w.id = id;
  const offset = (state.openWindows || 0) * 20;
  state.openWindows = (state.openWindows || 0) + 1;
  w.style.left = (40 + offset) + 'px';
  w.style.top = (70 + offset) + 'px';
  const titlebar = document.createElement('div');
  titlebar.className = 'titlebar';
  titlebar.innerHTML = `<span>${escapeHtml(opts.title)}</span><button>×</button>`;
  const body = document.createElement('div');
  body.className = 'body';
  w.appendChild(titlebar);
  w.appendChild(body);
  host.appendChild(w);
  titlebar.querySelector('button').onclick = () => {
    w.remove();
    state.openWindows = Math.max(0, (state.openWindows || 1) - 1);
    if (opts.onClose) opts.onClose();
  };
  // drag
  makeDraggable(w, titlebar);
  if (typeof opts.render === 'function') {
    const refresh = () => {
      body.innerHTML = '';
      opts.render(body, () => refresh());
    };
    refresh();
    w._refresh = refresh;
  } else if (opts.body) {
    body.innerHTML = opts.body;
  }
  return { el: w, body, close: () => w.remove(), refresh: w._refresh };
}

function makeDraggable(win, handle) {
  let dx = 0, dy = 0, sx = 0, sy = 0, dragging = false;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    dx = win.offsetLeft; dy = win.offsetTop;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    win.style.left = (dx + e.clientX - sx) + 'px';
    win.style.top = (dy + e.clientY - sy) + 'px';
  });
  handle.addEventListener('pointerup', () => { dragging = false; });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

export function rideListWindow(state) {
  return openWindow(state, {
    title: 'Rides & Shops',
    render: (body, refresh) => {
      const all = [...state.rides, ...state.coasters].filter(r => !r.demolished);
      if (all.length === 0) {
        body.innerHTML = '<p>No rides yet. Build something!</p>';
        return;
      }
      for (const r of all) {
        const div = document.createElement('div');
        div.className = 'row';
        const excHtml = r.excitement ? `<span title="Excitement">E ${r.excitement.toFixed(1)}</span> · <span title="Intensity">I ${r.intensity.toFixed(1)}</span> · <span title="Nausea">N ${r.nausea.toFixed(1)}</span>` : '';
        div.innerHTML = `
          <div style="flex:1">
            <b>${escapeHtml(r.name)}</b>
            <div style="font-size:10px;color:#8a92ac">${escapeHtml(r.category || 'ride')} · ${escapeHtml(r.status)}
              ${r.category !== 'shop' && r.queue ? ` · Q ${r.queue.length}` : ''}
              · $${r.totalProfit || 0}
            </div>
            <div style="font-size:10px;color:#a0aacc">${excHtml}</div>
          </div>
          <div><button data-action="show">View</button></div>
        `;
        div.querySelector('button').onclick = () => rideDetailWindow(state, r);
        body.appendChild(div);
      }
    }
  });
}

export function rideDetailWindow(state, ride) {
  return openWindow(state, {
    title: ride.name,
    render: (body, refresh) => {
      const isCoaster = !!ride.pieces;
      const excitement = ride.excitement || 0;
      const intensity = ride.intensity || 0;
      const nausea = ride.nausea || 0;
      const queueLen = (ride.queue && ride.queue.length) || 0;
      body.innerHTML = `
        <div class="row"><b>Status</b><span>${ride.status}</span></div>
        ${isCoaster ? `<div class="row"><b>Pieces</b><span>${ride.pieces.length}</span></div>` : ''}
        <div class="row"><b>Excitement</b><span>${excitement.toFixed(2)}</span></div>
        <div class="row"><b>Intensity</b><span>${intensity.toFixed(2)}</span></div>
        <div class="row"><b>Nausea</b><span>${nausea.toFixed(2)}</span></div>
        <div class="row"><b>Queue</b><span>${queueLen}</span></div>
        <div class="row"><b>Price</b>
          <span>
            <button data-act="price-down">-</button>
            $${ride.price}
            <button data-act="price-up">+</button>
          </span>
        </div>
        <div class="row"><b>Customers</b><span>${ride.totalCustomers || 0}</span></div>
        <div class="row"><b>Profit</b><span>$${ride.totalProfit || 0}</span></div>
        <div class="row"><b>Reliability</b><span>${Math.round((ride.reliability || 0) / 2.55)}%</span></div>
        <div style="margin-top:10px">
          ${ride.status === 'closed' || ride.status === 'testing' ? '<button data-act="open">Open</button>' : ''}
          ${ride.status === 'open' ? '<button data-act="close">Close</button>' : ''}
          ${ride.status === 'closed' && isCoaster && !ride.tested ? '<button data-act="test">Test</button>' : ''}
          <button data-act="demolish">Demolish</button>
        </div>
      `;
      body.querySelector('[data-act="price-up"]').onclick = () => { ride.price = Math.min(99, ride.price + 1); refresh(); };
      body.querySelector('[data-act="price-down"]').onclick = () => { ride.price = Math.max(0, ride.price - 1); refresh(); };
      const open = body.querySelector('[data-act="open"]');
      if (open) open.onclick = () => { ride.status = 'open'; refresh(); };
      const close = body.querySelector('[data-act="close"]');
      if (close) close.onclick = () => { ride.status = 'closed'; refresh(); };
      const test = body.querySelector('[data-act="test"]');
      if (test) test.onclick = () => { ride.tested = true; refresh(); };
      body.querySelector('[data-act="demolish"]').onclick = () => {
        state._demolishCallback(ride);
        refresh();
      };
    }
  });
}

export function peepDetailWindow(state, peep) {
  return openWindow(state, {
    title: peep.name,
    render: (body, refresh) => {
      const bar = (label, val, max = 255, color = '#6bd97c') =>
        `<div class="stat-bar"><div class="label">${label}</div>
        <div class="bg"><i style="width:${Math.min(100, val / max * 100)}%; background:${color}"></i></div>
        <div style="width:30px;text-align:right;">${Math.round(val)}</div></div>`;
      body.innerHTML = `
        <div class="row"><b>State</b><span>${peep.state}</span></div>
        <div class="row"><b>Cash</b><span>$${peep.cash}</span></div>
        <div class="row"><b>Spent</b><span>$${peep.spent}</span></div>
        ${bar('Happiness', peep.happiness, 255, '#6bd97c')}
        ${bar('Hunger', peep.hunger, 255, '#e89bcd')}
        ${bar('Thirst', peep.thirst, 255, '#3a7bd0')}
        ${bar('Bathroom', peep.bathroom, 255, '#daa520')}
        ${bar('Tiredness', peep.tiredness, 255, '#a02fd0')}
        ${bar('Nausea', peep.nausea, 255, '#c33a3a')}
        ${bar('Energy', peep.energy, 255, '#ffd76b')}
        <div style="margin-top:8px;font-size:11px;color:#8a92ac">Thoughts:</div>
        <div style="font-size:11px;line-height:1.5">
          ${(peep.thoughts || []).slice(0, 5).map(t => `<div>" ${escapeHtml(t.text)} "</div>`).join('')}
        </div>
      `;
    }
  });
}

export function financeWindow(state) {
  return openWindow(state, {
    title: 'Finances',
    render: (body, refresh) => {
      const f = state.finance;
      const lastMonth = f.monthly[f.monthly.length - 1] || { income: 0, expense: 0, byCategory: {} };
      const cats = Object.entries(lastMonth.byCategory || {}).map(([k, v]) =>
        `<div class="row"><b>${k}</b><span style="color:${v >= 0 ? '#6bd97c' : '#ff6b78'}">$${v}</span></div>`).join('');
      body.innerHTML = `
        <div class="row"><b>Cash</b><span style="color:${f.cash >= 0 ? '#6bd97c' : '#ff6b78'}">$${f.cash}</span></div>
        <div class="row"><b>Loan</b><span>$${f.loan}</span></div>
        <div class="row"><b>Loan Limit</b><span>$${f.loanLimit}</span></div>
        <div class="row"><b>Park Value</b><span>$${f.parkValue(state.rides, state.coasters)}</span></div>
        <div class="row"><b>Interest Rate</b><span>${(f.interestRate * 100).toFixed(1)}%/mo</span></div>
        <div style="margin-top:8px;font-size:11px;color:#8a92ac">Last month:</div>
        ${cats || '<div style="color:#5a6480">no activity yet</div>'}
        <div style="margin-top:8px">
          <button data-act="loan-up">Borrow $1000</button>
          <button data-act="loan-down">Repay $1000</button>
        </div>
      `;
      body.querySelector('[data-act="loan-up"]').onclick = () => { f.takeLoan(1000); refresh(); };
      body.querySelector('[data-act="loan-down"]').onclick = () => { f.payLoan(1000); refresh(); };
    }
  });
}

export function parkInfoWindow(state) {
  return openWindow(state, {
    title: 'Park Info',
    render: (body, refresh) => {
      body.innerHTML = `
        <div class="row"><b>Name</b><span>${escapeHtml(state.parkName)}</span></div>
        <div class="row"><b>Rating</b><span>${state.parkRating}</span></div>
        <div class="row"><b>Guests in Park</b><span>${state.peeps.filter(p => p.alive).length}</span></div>
        <div class="row"><b>Date</b><span>${monthName(state.time.month)} Y${state.time.year + 1}</span></div>
        <div class="row"><b>Scenario</b><span>${escapeHtml(state.scenario.name)}</span></div>
        <div class="row"><b>Objective</b><span>${escapeHtml(formatObjective(state.scenario.objective))}</span></div>
        <div class="row"><b>Time left</b><span>${objectiveTimeLeft(state)}</span></div>
        <div class="row"><b>Rides Built</b><span>${state.rides.filter(r => !r.demolished).length + state.coasters.filter(c => !c.demolished).length}</span></div>
        <div class="row"><b>Staff</b><span>${state.staff.length}</span></div>
      `;
    }
  });
}

export function researchWindow(state) {
  return openWindow(state, {
    title: 'Research & Development',
    render: (body, refresh) => {
      const r = state.research;
      body.innerHTML = `
        <div class="row"><b>Category</b>
          <select id="rcat">
            <option value="gentle">Gentle</option>
            <option value="thrill">Thrill</option>
            <option value="shops">Shops</option>
            <option value="coaster">Coasters</option>
          </select>
        </div>
        <div class="row"><b>Budget</b>
          <span><button data-act="bd">-</button> $${r.budget}/mo <button data-act="bu">+</button></span>
        </div>
        <div class="stat-bar"><div class="label">Progress</div>
          <div class="bg"><i style="width:${r.progress / 10}%;background:#6bd97c"></i></div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:#8a92ac">Unlocked:</div>
        <div style="font-size:11px;line-height:1.5">${[...r.unlocked].map(escapeHtml).join(', ')}</div>
      `;
      body.querySelector('#rcat').value = r.category;
      body.querySelector('#rcat').onchange = (e) => { r.category = e.target.value; refresh(); };
      body.querySelector('[data-act="bu"]').onclick = () => { r.budget = Math.min(400, r.budget + 50); refresh(); };
      body.querySelector('[data-act="bd"]').onclick = () => { r.budget = Math.max(0, r.budget - 50); refresh(); };
    }
  });
}

export function staffWindow(state) {
  return openWindow(state, {
    title: 'Staff',
    render: (body, refresh) => {
      if (state.staff.length === 0) {
        body.innerHTML = '<p>No staff hired yet.</p>';
        return;
      }
      body.innerHTML = state.staff.map(s => `
        <div class="row" data-id="${s.id}">
          <span>${escapeHtml(s.name)} <small style="color:#8a92ac">${s.kind}</small></span>
          <button data-act="fire" data-id="${s.id}">Fire</button>
        </div>
      `).join('');
      body.querySelectorAll('[data-act="fire"]').forEach(b => {
        b.onclick = () => { state._fireStaff(+b.dataset.id); refresh(); };
      });
    }
  });
}

export function coasterBuilderWindow(state, coaster) {
  return openWindow(state, {
    title: `Building ${coaster.name}`,
    render: (body, refresh) => {
      const closed = coaster.pieces.length >= 4 && cursorAtStart(coaster);
      body.innerHTML = `
        <div style="font-size:11px;color:#8a92ac;margin-bottom:6px">Cursor at (${coaster.cursor.tx}, ${coaster.cursor.ty}), facing ${['N','E','S','W'][coaster.cursor.dir]}, h=${coaster.cursor.h}</div>
        <div class="row"><b>Pieces</b><span>${coaster.pieces.length}</span></div>
        <div class="row"><b>Length</b><span>${coaster.length.toFixed(1)}</span></div>
        <div class="row"><b>Min/Max H</b><span>${coaster.minH} / ${coaster.maxH}</span></div>
        <div style="margin-top:8px">
          <button data-piece="straight">Straight</button>
          <button data-piece="chain">Chain Lift</button>
          <button data-piece="slope_up">Slope Up</button>
          <button data-piece="slope_dn">Slope Down</button>
          <button data-piece="curve_l">Curve Left</button>
          <button data-piece="curve_r">Curve Right</button>
          <button data-piece="brake">Brake</button>
          ${coaster.type === 'steel' ? '<button data-piece="loop">Loop</button>' : ''}
        </div>
        <div style="margin-top:6px">
          <button data-act="undo">Undo Piece</button>
          ${closed ? '<button data-act="finish">Finish &amp; Open</button>' : '<button disabled title="Track must form a closed circuit">Finish (need closure)</button>'}
          <button data-act="cancel">Cancel/Demolish</button>
        </div>
      `;
      body.querySelectorAll('[data-piece]').forEach(b => {
        b.onclick = () => { state._addCoasterPiece(coaster, b.dataset.piece); refresh(); };
      });
      body.querySelector('[data-act="undo"]').onclick = () => { state._undoCoasterPiece(coaster); refresh(); };
      const finishBtn = body.querySelector('[data-act="finish"]');
      if (finishBtn) finishBtn.onclick = () => { state._finishCoaster(coaster); };
      body.querySelector('[data-act="cancel"]').onclick = () => { state._cancelCoaster(coaster); };
    }
  });
}

function cursorAtStart(coaster) {
  if (coaster.pieces.length < 4) return false;
  const s = coaster.pieces[0];
  return s.tx === coaster.cursor.tx && s.ty === coaster.cursor.ty && Math.abs(s.h - coaster.cursor.h) <= 1;
}

export function gameOverWindow(state, won) {
  const win = openWindow(state, {
    title: won ? '🎉 Scenario Complete!' : '💀 Scenario Failed',
    render: (body) => {
      body.innerHTML = `
        <h2 style="margin: 4px 0; color: ${won ? '#6bd97c' : '#ff6b78'}">
          ${won ? 'You did it!' : 'Better luck next time'}
        </h2>
        <p>${won
          ? 'You met the scenario objectives. Your park is a roaring success.'
          : 'Time has run out and the objectives were not met. Try a different strategy.'}</p>
        <div class="row"><b>Final Rating</b><span>${state.parkRating}</span></div>
        <div class="row"><b>Final Guests</b><span>${state.peeps.filter(p => p.alive).length}</span></div>
        <div class="row"><b>Park Value</b><span>$${state.finance.parkValue(state.rides, state.coasters)}</span></div>
        <div style="margin-top:10px">
          <button onclick="location.reload()">Main Menu</button>
        </div>
      `;
    }
  });
  return win;
}

function formatObjective(o) {
  if (!o) return '—';
  if (o.kind === 'guests') return `${o.count} guests @ rating ${o.rating}+`;
  if (o.kind === 'value') return `Park value $${o.amount}`;
  return o.kind;
}

function objectiveTimeLeft(state) {
  const total = (state.scenario.objective?.years || 0) * 12;
  const passed = state.time.month + state.time.year * 12;
  const left = total - passed;
  if (left <= 0) return 'expired';
  return `${Math.floor(left / 12)}y ${left % 12}mo`;
}

const MONTH_NAMES = ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
function monthName(m) { return MONTH_NAMES[m] || 'Mar'; }
