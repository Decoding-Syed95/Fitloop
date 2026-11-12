// FitLoop UI: vanilla JS, no framework, no AI.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const STAGE_LABEL = { new: 'New', contacted: 'Contacted', trial_booked: 'Trial booked', trial_done: 'Trial done', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const CHANNEL_LABEL = { whatsapp: 'WhatsApp', call: 'Call', email: 'Email', visit: 'Visit', sms: 'SMS' };
const ICON = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 004 0"/>',
  funnel: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 4.5a3.5 3.5 0 010 7M22 20c0-3-1.5-5-4-5.7"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 01-12 0zM12 18v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

let S = null, view = 'dashboard', fuTab = 'today', q = '', stageFilter = '', memFilter = 'all';

async function api(method, url, body) {
  const r = await fetch('/api' + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401 && url !== '/login') { renderLogin(); throw new Error('Signed out'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }
async function act(fn, msg) { try { await fn(); if (msg) toast(msg); await refresh(); } catch (e) { toast(e.message); } }
async function refresh() { S = await api('GET', '/state'); render(); }

// ---------- login ----------
function renderLogin() {
  $('#root').innerHTML = `<div class="login"><form class="box" id="lf">
    <div class="logo">F</div><h1>FitLoop</h1><p class="t">Sales follow-ups & member desk for fitness studios</p>
    <div class="card">
      <div class="field"><label>Username</label><input name="username" autocomplete="username" required></div>
      <div class="field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>
      <div class="err" id="le"></div>
      <button class="btn gold" style="width:100%;justify-content:center">Sign in</button>
    </div>
    <p class="hint">Demo login: <b>demo</b> / <b>gold2026</b></p></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api('POST', '/login', f); await refresh(); } catch (er) { $('#le').textContent = er.message; }
  };
}

// ---------- shell ----------
const NAV = [['dashboard', 'Dashboard', 'home'], ['followups', 'Follow-ups', 'bell'], ['pipeline', 'Pipeline', 'funnel'], ['leads', 'Leads', 'users'], ['members', 'Members', 'card'], ['plans', 'Plans', 'tag'], ['activity', 'Activity', 'clock']];
function render() {
  if (!S) return;
  const t = S.today;
  const openFu = S.followups.filter((f) => f.status === 'open');
  const due = openFu.filter((f) => f.due <= t).length;
  const badge = (k) => (k === 'followups' && due ? `<span class="badge ${openFu.some((f) => f.due < t) ? 'red' : ''}">${due}</span>` : '');
  $('#root').innerHTML = `<div class="app"><aside class="side">
    <div class="brand"><div class="logo">F</div><div><b>FitLoop</b><small>Gym desk</small></div></div>
    <nav class="nav">${NAV.map(([k, l, i]) => `<button data-v="${k}" class="${view === k ? 'on' : ''}">${ic(i)}<span class="lbl">${l}</span>${badge(k)}</button>`).join('')}</nav>
    <div class="spacer"></div>
    <nav class="nav"><button id="connect">${ic('plug')}<span class="lbl">Connect Claude</span></button><button id="logout"><span class="lbl" style="padding-left:29px">Sign out</span></button></nav>
  </aside><main class="main" id="main"></main></div>`;
  document.querySelectorAll('.nav [data-v]').forEach((b) => (b.onclick = () => { view = b.dataset.v; render(); window.scrollTo(0, 0); }));
  $('#connect').onclick = connectModal;
  $('#logout').onclick = async () => { await api('POST', '/logout'); S = null; renderLogin(); };
  ({ dashboard, followups, pipeline, leads, members, plans, activity }[view])($('#main'));
}
const head = (title, sub, actions = '') => `<div class="top"><div><h1>${title}</h1><p>${sub}</p></div><div class="actions">${actions}</div></div>`;
const addLeadBtn = `<button class="btn gold" id="addlead">${ic('plus')} Add lead</button>`;
const bindAdd = () => { const b = $('#addlead'); if (b) b.onclick = () => leadDrawer(); };

// ---------- helpers ----------
const leadOf = (id) => S.leads.find((l) => l.id === id);
const dueLabel = (d) => { const t = S.today; if (d < t) { const n = Math.round((new Date(t) - new Date(d)) / 864e5); return `<span class="pill red">${n}d overdue</span>`; } if (d === t) return '<span class="pill gold">Today</span>'; return `<span class="pill">${fmtDate(d)}</span>`; };
const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const stagePill = (s) => `<span class="pill ${s === 'won' ? 'green' : s === 'lost' ? 'red' : s === 'negotiation' || s === 'trial_done' ? 'gold' : ''}">${STAGE_LABEL[s]}</span>`;
const waLink = (phone, msg) => `https://wa.me/${String(phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg || '')}`;
function modal(html, { right = false, onMount } = {}) {
  const el = document.createElement('div');
  el.className = 'scrim' + (right ? ' right' : '');
  el.innerHTML = `<div class="${right ? 'drawer' : 'modal'}">${html}</div>`;
  el.onmousedown = (e) => { if (e.target === el) el.remove(); };
  document.body.appendChild(el);
  onMount && onMount(el);
  return el;
}

// ---------- dashboard ----------
function dashboard(m) {
  const t = S.today, open = S.followups.filter((f) => f.status === 'open');
  const todays = open.filter((f) => f.due <= t).sort((a, b) => a.due.localeCompare(b.due));
  const pipeVal = S.leads.filter((l) => !['won', 'lost'].includes(l.stage)).reduce((s, l) => s + (+l.value || 0), 0);
  const won = S.leads.filter((l) => l.stage === 'won').length, lost = S.leads.filter((l) => l.stage === 'lost').length;
  const month = t.slice(0, 7);
  const rev = S.members.filter((x) => x.start.slice(0, 7) === month).reduce((s, x) => s + (+x.amount_paid || 0), 0);
  const expiring = S.members.filter((x) => x.status === 'expiring' || x.status === 'expired').sort((a, b) => a.end.localeCompare(b.end));
  const max = Math.max(1, ...S.stages.map((s) => S.leads.filter((l) => l.stage === s).length));
  const noFu = S.leads.filter((l) => !['won', 'lost'].includes(l.stage) && !open.some((f) => f.lead_id === l.id));
  m.innerHTML = head('Good day, coach', new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }), addLeadBtn) + `
  <div class="grid stats">
    <div class="stat"><div class="k">Follow-ups due</div><div class="v ${todays.some((f) => f.due < t) ? 'red' : 'gold'} num">${todays.length}</div><div class="s">${open.filter((f) => f.due < t).length} overdue</div></div>
    <div class="stat"><div class="k">Open pipeline</div><div class="v num">${inr(pipeVal)}</div><div class="s">${S.leads.filter((l) => !['won', 'lost'].includes(l.stage)).length} active leads</div></div>
    <div class="stat"><div class="k">Revenue this month</div><div class="v num">${inr(rev)}</div><div class="s">${S.members.filter((x) => x.status !== 'expired').length} active members</div></div>
    <div class="stat"><div class="k">Win rate</div><div class="v num">${won + lost ? Math.round((won / (won + lost)) * 100) : 0}%</div><div class="s">${won} won · ${lost} lost</div></div>
  </div>
  <div class="grid two">
    <div class="card"><h3>Reach out today</h3>
      ${todays.length ? todays.slice(0, 6).map((f) => { const l = leadOf(f.lead_id) || {}; return `<div class="mini"><div class="l"><b>${esc(l.name)}</b><span>${esc(f.purpose)} · ${CHANNEL_LABEL[f.channel]}</span></div><div style="display:flex;gap:8px;align-items:center">${dueLabel(f.due)}<button class="btn sm" data-go="followups">Open</button></div></div>`; }).join('') : '<div class="empty">All caught up. Ask Claude to plan the next round.</div>'}
      ${noFu.length ? `<div class="tl"><h4>Leads with no next step</h4>${noFu.map((l) => `<span class="pill amber" style="margin:0 6px 6px 0;cursor:pointer" data-lead="${l.id}">${esc(l.name)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="card"><h3>Pipeline</h3><div class="bars">
      ${S.stages.map((s) => { const n = S.leads.filter((l) => l.stage === s).length; return `<div class="b"><span>${STAGE_LABEL[s]}</span><div class="t"><i style="width:${(n / max) * 100}%"></i></div><span class="n num">${n}</span></div>`; }).join('')}
    </div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Renewals to chase</h3>
    ${expiring.length ? expiring.map((x) => `<div class="mini"><div class="l"><b>${esc(x.name)}</b><span>${esc(x.plan_name)} · ends ${fmtDate(x.end)}</span></div><div style="display:flex;gap:8px;align-items:center"><span class="pill ${x.status === 'expired' ? 'red' : 'amber'}">${x.status === 'expired' ? 'Expired' : x.days_left + 'd left'}</span><button class="btn sm" data-renew="${x.id}">Renew</button></div></div>`).join('') : '<div class="empty">No memberships ending soon.</div>'}
  </div>`;
  bindAdd();
  m.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { view = b.dataset.go; render(); }));
  m.querySelectorAll('[data-lead]').forEach((b) => (b.onclick = () => leadDrawer(b.dataset.lead)));
  m.querySelectorAll('[data-renew]').forEach((b) => (b.onclick = () => renewModal(b.dataset.renew)));
}

// ---------- follow-ups ----------
function followups(m) {
  const t = S.today, all = S.followups;
  const sets = {
    today: all.filter((f) => f.status === 'open' && f.due <= t),
    upcoming: all.filter((f) => f.status === 'open' && f.due > t),
    done: all.filter((f) => f.status !== 'open').sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')),
  };
  sets.today.sort((a, b) => a.due.localeCompare(b.due)); sets.upcoming.sort((a, b) => a.due.localeCompare(b.due));
  const list = sets[fuTab];
  m.innerHTML = head('Follow-ups', 'Messages drafted by Claude. Edit, send, and log the outcome.', `<button class="btn gold" id="addfu">${ic('plus')} New follow-up</button>`) + `
  <div class="tabs">${[['today', 'Due & overdue'], ['upcoming', 'Upcoming'], ['done', 'Done']].map(([k, l]) => `<button data-t="${k}" class="${fuTab === k ? 'on' : ''}">${l}<small>${sets[k].length}</small></button>`).join('')}</div>
  ${list.length ? list.map((f) => { const l = leadOf(f.lead_id) || { name: 'Unknown' }; const isOpen = f.status === 'open'; return `
  <div class="fu ${isOpen && f.due < t ? 'overdue' : ''}" data-id="${f.id}">
    <div class="fu-head"><div><b style="font-size:15px;cursor:pointer" data-lead="${l.id}">${esc(l.name)}</b>
      <div class="meta">${isOpen ? dueLabel(f.due) : `<span class="pill ${f.status === 'done' ? 'green' : ''}">${f.status === 'done' ? 'Done' : 'Skipped'}</span>`}<span class="pill">${CHANNEL_LABEL[f.channel]}</span>${l.stage ? stagePill(l.stage) : ''}<span class="by">${esc(f.purpose)} · by ${f.created_by === 'claude' ? 'Claude' : 'staff'}</span></div></div>
      ${l.phone ? `<span class="by num">${esc(l.phone)}</span>` : ''}</div>
    ${isOpen ? `<textarea data-msg>${esc(f.message)}</textarea>
    <div class="btns">
      ${f.channel === 'call' && l.phone ? `<a class="btn sm" href="tel:${esc(l.phone)}">Call</a>` : f.channel === 'email' && l.email ? `<a class="btn sm" data-mail href="#">Email</a>` : l.phone ? `<a class="btn sm" data-wa target="_blank" rel="noopener">Open WhatsApp</a>` : ''}
      <button class="btn sm" data-copy>Copy</button><button class="btn sm" data-save>Save edit</button>
      <button class="btn sm gold" data-done>Mark done</button>
      <button class="btn sm ghost" data-snooze>Snooze 1d</button><button class="btn sm ghost danger" data-del>Delete</button>
    </div>` : `<div class="notes">${esc(f.message)}</div>${f.outcome ? `<div class="tl"><h4>Outcome</h4><div class="notes">${esc(f.outcome)}</div></div>` : ''}`}
  </div>`; }).join('') : `<div class="card empty">Nothing here. In Claude, try: “Plan this week's follow-ups for all my warm leads.”</div>`}`;
  m.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { fuTab = b.dataset.t; render(); }));
  $('#addfu').onclick = newFollowupModal;
  m.querySelectorAll('[data-lead]').forEach((b) => b.dataset.lead && (b.onclick = () => leadDrawer(b.dataset.lead)));
  m.querySelectorAll('.fu').forEach((card) => {
    const id = card.dataset.id, f = S.followups.find((x) => x.id === id), l = leadOf(f.lead_id) || {};
    const msg = () => $('[data-msg]', card)?.value || '';
    const wa = $('[data-wa]', card); if (wa) wa.onmouseenter = wa.onfocus = wa.onclick = () => (wa.href = waLink(l.phone, msg()));
    const mail = $('[data-mail]', card); if (mail) mail.onclick = (e) => { e.preventDefault(); location.href = `mailto:${l.email}?subject=${encodeURIComponent(f.purpose)}&body=${encodeURIComponent(msg())}`; };
    const on = (sel, fn) => { const b = $(sel, card); if (b) b.onclick = fn; };
    on('[data-copy]', () => navigator.clipboard.writeText(msg()).then(() => toast('Copied')));
    on('[data-save]', () => act(() => api('PATCH', '/followups/' + id, { message: msg() }), 'Saved'));
    on('[data-done]', () => doneModal(f, msg()));
    on('[data-snooze]', () => act(() => api('PATCH', '/followups/' + id, { due: '+1d' }), 'Moved to tomorrow'));
    on('[data-del]', () => confirm('Delete this follow-up?') && act(() => api('DELETE', '/followups/' + id), 'Deleted'));
  });
}
function doneModal(f, msg) {
  const l = leadOf(f.lead_id) || {};
  const el = modal(`<h2>Log outcome</h2><p class="sub">${esc(l.name)} · ${esc(f.purpose)}</p>
    <div class="field"><label>What happened?</label><textarea id="oc" placeholder="Replied, wants to visit Saturday…"></textarea></div>
    <div class="field"><label>Schedule next follow-up (optional)</label><div class="row2"><input type="date" id="nd"><select id="nc">${Object.entries(CHANNEL_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
    <div class="field" id="nmw" style="display:none"><label>Message</label><textarea id="nm" placeholder="Write it yourself, or ask Claude to draft it later"></textarea></div>
    <div class="foot"><button class="btn ghost" id="x">Cancel</button><button class="btn gold" id="ok">Save</button></div>`);
  $('#nd', el).onchange = (e) => ($('#nmw', el).style.display = e.target.value ? 'block' : 'none');
  $('#x', el).onclick = () => el.remove();
  $('#ok', el).onclick = () => {
    const nd = $('#nd', el).value;
    const body = { outcome: $('#oc', el).value, next: nd ? { due: nd, channel: $('#nc', el).value, purpose: 'Follow up', message: $('#nm', el).value } : undefined };
    el.remove();
    act(() => api('POST', `/followups/${f.id}/complete`, body), 'Logged');
  };
}
function newFollowupModal(prefLead) {
  const el = modal(`<h2>New follow-up</h2><p class="sub">Schedule a reminder with a message.</p>
    <div class="field"><label>Lead</label><select id="fl">${S.leads.filter((l) => !['won', 'lost'].includes(l.stage)).map((l) => `<option value="${l.id}" ${l.id === prefLead ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
    <div class="row2"><div class="field"><label>Due</label><input type="date" id="fd" value="${S.today}"></div><div class="field"><label>Channel</label><select id="fc">${Object.entries(CHANNEL_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
    <div class="field"><label>Purpose</label><input id="fp" placeholder="Trial reminder"></div>
    <div class="field"><label>Message</label><textarea id="fm"></textarea></div>
    <div class="foot"><button class="btn ghost" id="x">Cancel</button><button class="btn gold" id="ok">Schedule</button></div>`);
  $('#x', el).onclick = () => el.remove();
  $('#ok', el).onclick = () => { const b = { lead_id: $('#fl', el).value, due: $('#fd', el).value, channel: $('#fc', el).value, purpose: $('#fp', el).value, message: $('#fm', el).value }; el.remove(); act(() => api('POST', '/followups', b), 'Scheduled'); };
}

// ---------- pipeline ----------
function pipeline(m) {
  m.innerHTML = head('Pipeline', 'Drag a card to move a lead to the next stage.', addLeadBtn) + `<div class="board">${S.stages.map((s) => {
    const ls = S.leads.filter((l) => l.stage === s);
    return `<div class="col" data-s="${s}"><h4><span>${STAGE_LABEL[s]}</span><span class="num">${ls.length}</span></h4>${ls.map((l) => `<div class="kc" draggable="true" data-id="${l.id}"><b>${esc(l.name)}</b><span>${esc(l.goal || l.source)}</span><div class="v num">${inr(l.value)}</div></div>`).join('')}</div>`;
  }).join('')}</div>`;
  bindAdd();
  let drag = null;
  m.querySelectorAll('.kc').forEach((c) => { c.ondragstart = () => (drag = c.dataset.id); c.onclick = () => leadDrawer(c.dataset.id); });
  m.querySelectorAll('.col').forEach((c) => {
    c.ondragover = (e) => { e.preventDefault(); c.classList.add('over'); };
    c.ondragleave = () => c.classList.remove('over');
    c.ondrop = (e) => { e.preventDefault(); const lead = leadOf(drag); if (!lead || lead.stage === c.dataset.s) return render(); if (c.dataset.s === 'won') return convertModal(drag); act(() => api('PATCH', '/leads/' + drag, { stage: c.dataset.s }), 'Moved'); };
  });
}

// ---------- leads ----------
function leads(m) {
  const open = S.followups.filter((f) => f.status === 'open');
  const rows = S.leads.filter((l) => (!stageFilter || l.stage === stageFilter) && (!q || [l.name, l.phone, l.email, l.goal, l.source].join(' ').toLowerCase().includes(q.toLowerCase())));
  m.innerHTML = head('Leads', `${S.leads.length} people in your funnel`, addLeadBtn) + `
  <div class="toolbar"><input id="q" placeholder="Search name, phone, goal…" value="${esc(q)}"><select id="sf"><option value="">All stages</option>${S.stages.map((s) => `<option value="${s}" ${stageFilter === s ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select></div>
  <div class="card" style="padding:18px 8px 6px;overflow-x:auto"><table><thead><tr><th>Lead</th><th>Stage</th><th class="hide-m">Source</th><th class="hide-m">Goal</th><th>Next follow-up</th><th style="text-align:right">Value</th></tr></thead><tbody>
  ${rows.map((l) => { const n = open.filter((f) => f.lead_id === l.id).sort((a, b) => a.due.localeCompare(b.due))[0]; return `<tr data-id="${l.id}"><td class="who"><b>${esc(l.name)}</b><span>${esc(l.phone)}</span></td><td>${stagePill(l.stage)}</td><td class="hide-m">${esc(l.source)}</td><td class="hide-m">${esc(l.goal)}</td><td>${n ? dueLabel(n.due) : ['won', 'lost'].includes(l.stage) ? '' : '<span class="pill amber">None set</span>'}</td><td class="num" style="text-align:right">${inr(l.value)}</td></tr>`; }).join('')}
  </tbody></table>${rows.length ? '' : '<div class="empty">No leads match.</div>'}</div>`;
  bindAdd();
  $('#q').oninput = (e) => { q = e.target.value; const p = e.target.selectionStart; leads(m); const i = $('#q'); i.focus(); i.setSelectionRange(p, p); };
  $('#sf').onchange = (e) => { stageFilter = e.target.value; leads(m); };
  m.querySelectorAll('tbody tr').forEach((r) => (r.onclick = () => leadDrawer(r.dataset.id)));
}
function leadDrawer(id) {
  const l = id ? leadOf(id) : { name: '', phone: '', email: '', source: 'Instagram', goal: '', stage: 'new', interested_plan: '', value: 0, notes: '' };
  const fus = id ? S.followups.filter((f) => f.lead_id === id).sort((a, b) => b.due.localeCompare(a.due)).slice(0, 4) : [];
  const el = modal(`<h2>${id ? esc(l.name) : 'Add lead'}</h2><p class="sub">${id ? 'Edit details, move stage, or convert to a member.' : 'Or just tell Claude who walked in.'}</p>
    <div class="field"><label>Name</label><input id="n" value="${esc(l.name)}"></div>
    <div class="row2"><div class="field"><label>Phone</label><input id="p" value="${esc(l.phone)}" placeholder="+91…"></div><div class="field"><label>Email</label><input id="e" value="${esc(l.email)}"></div></div>
    <div class="row2"><div class="field"><label>Source</label><input id="s" value="${esc(l.source)}"></div><div class="field"><label>Goal</label><input id="g" value="${esc(l.goal)}"></div></div>
    <div class="row2"><div class="field"><label>Stage</label><select id="st">${S.stages.map((s) => `<option value="${s}" ${l.stage === s ? 'selected' : ''}>${STAGE_LABEL[s]}</option>`).join('')}</select></div>
    <div class="field"><label>Interested plan</label><select id="pl"><option value="">—</option>${S.plans.map((p) => `<option ${l.interested_plan === p.name ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label>Expected value (₹)</label><input id="v" type="number" value="${l.value || ''}"></div>
    <div class="field"><label>Notes</label><textarea id="no" style="min-height:110px">${esc(l.notes)}</textarea></div>
    ${id ? `<div class="tl"><h4>Recent follow-ups</h4>${fus.length ? fus.map((f) => `<div class="mini"><div class="l"><b>${esc(f.purpose)}</b><span>${CHANNEL_LABEL[f.channel]} · ${fmtDate(f.due)}</span></div><span class="pill ${f.status === 'done' ? 'green' : f.status === 'open' ? 'gold' : ''}">${f.status}</span></div>`).join('') : '<span class="by">None yet</span>'}</div>` : ''}
    <div class="foot"><div style="display:flex;gap:8px">${id ? `<button class="btn danger sm" id="del">Delete</button>` : ''}${id ? `<button class="btn sm" id="fu">+ Follow-up</button>` : ''}${id && !['won'].includes(l.stage) ? `<button class="btn sm" id="cv">Convert to member</button>` : ''}</div>
    <div style="display:flex;gap:8px"><button class="btn ghost" id="x">Close</button><button class="btn gold" id="ok">${id ? 'Save' : 'Add lead'}</button></div></div>`, { right: true });
  const v = (i) => $(i, el).value;
  $('#x', el).onclick = () => el.remove();
  $('#ok', el).onclick = () => {
    const b = { name: v('#n'), phone: v('#p'), email: v('#e'), source: v('#s'), goal: v('#g'), stage: v('#st'), interested_plan: v('#pl'), value: +v('#v') || 0, notes: v('#no') };
    if (!b.name) return toast('Name is required');
    el.remove();
    if (b.stage === 'won' && id && l.stage !== 'won') { act(() => api('PATCH', '/leads/' + id, { ...b, stage: l.stage })); return convertModal(id); }
    act(() => (id ? api('PATCH', '/leads/' + id, b) : api('POST', '/leads', b)), 'Saved');
  };
  if (id) {
    $('#del', el).onclick = () => confirm('Delete this lead and its follow-ups?') && (el.remove(), act(() => api('DELETE', '/leads/' + id), 'Deleted'));
    $('#fu', el).onclick = () => { el.remove(); newFollowupModal(id); };
    const cv = $('#cv', el); if (cv) cv.onclick = () => { el.remove(); convertModal(id); };
  }
}
function convertModal(id) {
  const l = leadOf(id);
  const pre = S.plans.find((p) => p.name === l.interested_plan) || S.plans[0];
  const el = modal(`<h2>Convert to member</h2><p class="sub">${esc(l.name)} joins the gym.</p>
    <div class="field"><label>Plan</label><select id="cp">${S.plans.map((p) => `<option value="${p.id}" data-price="${p.price}" ${p.id === pre?.id ? 'selected' : ''}>${esc(p.name)} · ${inr(p.price)}</option>`).join('')}</select></div>
    <div class="row2"><div class="field"><label>Start date</label><input type="date" id="cs" value="${S.today}"></div><div class="field"><label>Amount paid (₹)</label><input type="number" id="ca" value="${pre?.price || 0}"></div></div>
    <div class="foot"><button class="btn ghost" id="x">Cancel</button><button class="btn gold" id="ok">Create membership</button></div>`);
  $('#cp', el).onchange = (e) => ($('#ca', el).value = e.target.selectedOptions[0].dataset.price);
  $('#x', el).onclick = () => { el.remove(); render(); };
  $('#ok', el).onclick = () => { const b = { plan: $('#cp', el).value, start: $('#cs', el).value, amount_paid: +$('#ca', el).value }; el.remove(); view = 'members'; act(() => api('POST', `/leads/${id}/convert`, b), 'Welcome aboard!'); };
}

// ---------- members ----------
function members(m) {
  const list = S.members.filter((x) => memFilter === 'all' || x.status === memFilter).sort((a, b) => a.end.localeCompare(b.end));
  const cnt = (s) => S.members.filter((x) => s === 'all' || x.status === s).length;
  m.innerHTML = head('Members', 'Active memberships and renewals.') + `
  <div class="tabs">${[['all', 'All'], ['active', 'Active'], ['expiring', 'Expiring soon'], ['expired', 'Expired']].map(([k, l]) => `<button data-t="${k}" class="${memFilter === k ? 'on' : ''}">${l}<small>${cnt(k)}</small></button>`).join('')}</div>
  <div class="card" style="padding:18px 8px 6px;overflow-x:auto"><table><thead><tr><th>Member</th><th>Plan</th><th>Ends</th><th>Status</th><th class="hide-m" style="text-align:right">Paid</th><th></th></tr></thead><tbody>
  ${list.map((x) => `<tr style="cursor:default"><td class="who"><b>${esc(x.name)}</b><span>${esc(x.phone)}</span></td><td>${esc(x.plan_name)}</td><td class="num">${fmtDate(x.end)}</td><td><span class="pill ${x.status === 'active' ? 'green' : x.status === 'expiring' ? 'amber' : 'red'}">${x.status === 'expiring' ? x.days_left + 'd left' : x.status}</span></td><td class="num hide-m" style="text-align:right">${inr(x.amount_paid)}</td><td style="text-align:right;white-space:nowrap">${x.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waLink(x.phone, x.status === 'active' ? '' : `Hi ${x.name.split(' ')[0]}! Your ${x.plan_name} membership ${x.status === 'expired' ? 'has ended' : 'ends on ' + fmtDate(x.end)}. Want us to renew it for you?`)}">WhatsApp</a>` : ''} <button class="btn sm" data-renew="${x.id}">Renew</button> <button class="btn sm ghost danger" data-del="${x.id}">✕</button></td></tr>`).join('')}
  </tbody></table>${list.length ? '' : '<div class="empty">No members here.</div>'}</div>`;
  m.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { memFilter = b.dataset.t; render(); }));
  m.querySelectorAll('[data-renew]').forEach((b) => (b.onclick = () => renewModal(b.dataset.renew)));
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirm('Remove this member?') && act(() => api('DELETE', '/members/' + b.dataset.del), 'Removed')));
}
function renewModal(id) {
  const mem = S.members.find((x) => x.id === id);
  const el = modal(`<h2>Renew ${esc(mem.name)}</h2><p class="sub">Extends from ${mem.status === 'expired' ? 'today' : fmtDate(mem.end)}.</p>
    <div class="field"><label>Plan</label><select id="rp">${S.plans.map((p) => `<option value="${p.id}" data-price="${p.price}" ${p.id === mem.plan_id ? 'selected' : ''}>${esc(p.name)} · ${inr(p.price)}</option>`).join('')}</select></div>
    <div class="field"><label>Amount paid (₹)</label><input type="number" id="ra" value="${S.plans.find((p) => p.id === mem.plan_id)?.price || 0}"></div>
    <div class="foot"><button class="btn ghost" id="x">Cancel</button><button class="btn gold" id="ok">Renew</button></div>`);
  $('#rp', el).onchange = (e) => ($('#ra', el).value = e.target.selectedOptions[0].dataset.price);
  $('#x', el).onclick = () => el.remove();
  $('#ok', el).onclick = () => { const b = { plan: $('#rp', el).value, amount_paid: +$('#ra', el).value }; el.remove(); act(() => api('POST', `/members/${id}/renew`, b), 'Renewed'); };
}

// ---------- plans ----------
function plans(m) {
  m.innerHTML = head('Plans', 'Claude uses these when it quotes prices and creates memberships.', `<button class="btn gold" id="ap">${ic('plus')} New plan</button>`) + `<div class="grid plans">${S.plans.map((p) => `<div class="card plan"><h3 style="margin-bottom:0">${esc(p.name)}</h3><div class="price num">${inr(p.price)} <small>/ ${p.duration_days} days</small></div><p style="color:var(--muted);min-height:42px">${esc(p.description)}</p><div style="display:flex;gap:8px;margin-top:10px"><button class="btn sm" data-e="${p.id}">Edit</button><button class="btn sm ghost danger" data-d="${p.id}">Delete</button></div></div>`).join('')}</div>`;
  $('#ap').onclick = () => planModal();
  m.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => planModal(b.dataset.e)));
  m.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => confirm('Delete plan? Existing members keep their dates.') && act(() => api('DELETE', '/plans/' + b.dataset.d), 'Deleted')));
}
function planModal(id) {
  const p = id ? S.plans.find((x) => x.id === id) : { name: '', price: '', duration_days: 30, description: '' };
  const el = modal(`<h2>${id ? 'Edit plan' : 'New plan'}</h2><p class="sub">&nbsp;</p>
    <div class="field"><label>Name</label><input id="pn" value="${esc(p.name)}"></div>
    <div class="row2"><div class="field"><label>Price (₹)</label><input id="pp" type="number" value="${p.price}"></div><div class="field"><label>Duration (days)</label><input id="pd" type="number" value="${p.duration_days}"></div></div>
    <div class="field"><label>Description</label><input id="pe" value="${esc(p.description)}"></div>
    <div class="foot"><button class="btn ghost" id="x">Cancel</button><button class="btn gold" id="ok">Save</button></div>`);
  $('#x', el).onclick = () => el.remove();
  $('#ok', el).onclick = () => { const b = { name: $('#pn', el).value, price: +$('#pp', el).value, duration_days: +$('#pd', el).value, description: $('#pe', el).value }; if (!b.name) return toast('Name is required'); el.remove(); act(() => (id ? api('PATCH', '/plans/' + id, b) : api('POST', '/plans', b)), 'Saved'); };
}

// ---------- activity ----------
function activity(m) {
  m.innerHTML = head('Activity', 'Everything Claude and your team changed, newest first.') + `<div class="card">${S.activity.map((a) => `<div class="act"><span class="dot ${a.actor}"></span><div>${esc(a.text)}<small>${a.actor === 'claude' ? 'Claude' : 'Team'} · ${new Date(a.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</small></div></div>`).join('') || '<div class="empty">No activity yet.</div>'}</div>`;
}

// ---------- connect ----------
async function connectModal() {
  const { mcp_url } = await api('GET', '/connect-info');
  const el = modal(`<h2>Connect Claude</h2><p class="sub">Use your own Claude plan to run the desk. FitLoop has no AI inside.</p>
    <label>Your MCP link</label><div class="code" id="u">${esc(mcp_url)}</div>
    <div style="margin:10px 0 18px"><button class="btn sm" id="cu">Copy link</button></div>
    <ol class="steps"><li>In Claude, open <b>Settings → Connectors</b>.</li><li>Choose <b>Add custom connector</b>, name it <b>FitLoop</b>, paste the link above.</li><li>Start a chat and enable the connector. Then try:</li></ol>
    <div class="prompt">Here are today's enquiries: “Rahul 98765 43210 from Instagram wants fat loss, Meera walked in asking about yoga + PT.” Add them and draft a first WhatsApp message for each.</div>
    <div class="prompt">Check my overdue follow-ups and rewrite the messages so they are short and friendly.</div>
    <div class="prompt">Who is expiring in 2 weeks? Draft renewal messages with a small loyalty offer.</div>
    <div class="foot"><span></span><button class="btn gold" id="x">Done</button></div>`);
  $('#cu', el).onclick = () => navigator.clipboard.writeText(mcp_url).then(() => toast('Link copied'));
  $('#x', el).onclick = () => el.remove();
}

// ---------- boot ----------
(async () => { try { await refresh(); } catch { renderLogin(); } })();
