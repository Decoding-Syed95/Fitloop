// FitLoop data layer: a tiny JSON-file store. No AI, no native deps.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'db.json');
const TZ = process.env.TZ_NAME || 'Asia/Kolkata';

export const STAGES = ['new', 'contacted', 'trial_booked', 'trial_done', 'negotiation', 'won', 'lost'];
export const CHANNELS = ['whatsapp', 'call', 'email', 'visit', 'sms'];

const uid = (p) => p + '_' + crypto.randomBytes(4).toString('hex');

// ---------- dates ----------
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function parseDate(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === 'today') return today();
  if (s === 'tomorrow') return addDays(today(), 1);
  const rel = s.match(/^\+(\d+)d?$/);
  if (rel) return addDays(today(), +rel[1]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(v);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  throw new Error(`Invalid date "${v}". Use YYYY-MM-DD, "today", "tomorrow" or "+3d".`);
}

// ---------- persistence ----------
let db;
function load() {
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    db = { leads: [], followups: [], members: [], plans: [], activity: [] };
    seed();
    save();
  }
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, FILE);
  }, 50);
}
export function flush() {
  clearTimeout(saveTimer);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export function log(text, actor = 'staff', ref = {}) {
  db.activity.unshift({ id: uid('act'), ts: new Date().toISOString(), actor, text, ...ref });
  db.activity = db.activity.slice(0, 300);
}

// ---------- seed ----------
function seed() {
  const t = today();
  db.plans = [
    { id: 'plan_monthly', name: 'Monthly', price: 2500, duration_days: 30, description: 'Gym floor access, 1 month' },
    { id: 'plan_quarter', name: 'Quarterly', price: 6500, duration_days: 90, description: 'Gym floor + group classes' },
    { id: 'plan_annual', name: 'Annual', price: 21000, duration_days: 365, description: 'Everything + 2 PT sessions / month' },
  ];
  const L = (name, phone, source, goal, stage, plan, notes, value) => ({
    id: uid('lead'), name, phone, email: '', source, goal, stage, interested_plan: plan, notes,
    owner: 'Front desk', value, lost_reason: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const leads = [
    L('Aarav Mehta', '+919810001111', 'Instagram', 'Fat loss', 'trial_done', 'Quarterly', 'Loved the trial. Worried about price.', 6500),
    L('Sneha Kapoor', '+919810002222', 'Walk-in', 'Muscle gain', 'contacted', 'Annual', 'Asked about PT packages.', 21000),
    L('Rohan Iyer', '+919810003333', 'Referral', 'Marathon prep', 'new', 'Monthly', '', 2500),
    L('Priya Nair', '+919810004444', 'Google Ads', 'Post-natal fitness', 'trial_booked', 'Quarterly', 'Trial Saturday 8am.', 6500),
    L('Kabir Singh', '+919810005555', 'Facebook', 'General fitness', 'negotiation', 'Annual', 'Wants a corporate discount.', 21000),
  ];
  db.leads = leads;
  db.followups = [
    { id: uid('fu'), lead_id: leads[0].id, due: addDays(t, -1), channel: 'whatsapp', purpose: 'Close after trial', message: 'Hi Aarav! Great to see you crush your trial yesterday. We have a Quarterly offer this week that makes it ₹2,167/month. Shall I hold a slot for you?', status: 'open', created_by: 'claude', created_at: new Date().toISOString() },
    { id: uid('fu'), lead_id: leads[1].id, due: t, channel: 'call', purpose: 'PT package pitch', message: 'Call Sneha: walk through the Annual plan with 2 PT sessions/month; offer a free body-composition scan.', status: 'open', created_by: 'claude', created_at: new Date().toISOString() },
    { id: uid('fu'), lead_id: leads[3].id, due: addDays(t, 1), channel: 'whatsapp', purpose: 'Trial reminder', message: 'Hi Priya! Quick reminder about your trial session this Saturday at 8am. Wear comfy shoes, we will take care of the rest.', status: 'open', created_by: 'claude', created_at: new Date().toISOString() },
    { id: uid('fu'), lead_id: leads[4].id, due: addDays(t, 2), channel: 'email', purpose: 'Corporate offer', message: 'Hi Kabir, following up on the corporate rate: 3+ colleagues joining together get 15% off the Annual plan.', status: 'open', created_by: 'staff', created_at: new Date().toISOString() },
  ];
  const M = (name, phone, plan, startOff, amount) => {
    const start = addDays(t, startOff);
    return { id: uid('mem'), lead_id: '', name, phone, email: '', plan_id: plan.id, plan_name: plan.name, start, end: addDays(start, plan.duration_days), amount_paid: amount, notes: '', created_at: new Date().toISOString() };
  };
  db.members = [
    M('Neha Joshi', '+919810006666', db.plans[0], -25, 2500),
    M('Vikram Rao', '+919810007777', db.plans[1], -40, 6500),
    M('Ishita Shah', '+919810008888', db.plans[2], -100, 21000),
    M('Arjun Das', '+919810009999', db.plans[0], -35, 2500),
  ];
  log('Workspace created with demo data', 'staff');
}

// ---------- helpers ----------
const clean = (o, allowed) => {
  const r = {};
  for (const k of allowed) if (o[k] !== undefined) r[k] = typeof o[k] === 'string' ? o[k].trim() : o[k];
  return r;
};
const LEAD_FIELDS = ['name', 'phone', 'email', 'source', 'goal', 'interested_plan', 'notes', 'owner', 'value', 'lost_reason'];

export function memberStatus(m) {
  const t = today();
  if (m.end < t) return 'expired';
  if (m.end <= addDays(t, 14)) return 'expiring';
  return 'active';
}

export function findLead(ref) {
  if (!ref) throw new Error('lead is required (id or name)');
  const r = String(ref).trim().toLowerCase();
  let hit = db.leads.find((l) => l.id.toLowerCase() === r);
  if (hit) return hit;
  const matches = db.leads.filter((l) => l.name.toLowerCase().includes(r) || (l.phone && l.phone.replace(/\D/g, '').endsWith(r.replace(/\D/g, '')) && r.replace(/\D/g, '').length >= 6));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`"${ref}" matches several leads: ${matches.map((m) => `${m.name} (${m.id})`).join(', ')}. Use the id.`);
  throw new Error(`No lead found for "${ref}"`);
}
export function findMember(ref) {
  const r = String(ref || '').trim().toLowerCase();
  const matches = db.members.filter((m) => m.id.toLowerCase() === r || m.name.toLowerCase().includes(r));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`"${ref}" matches several members: ${matches.map((m) => `${m.name} (${m.id})`).join(', ')}. Use the id.`);
  throw new Error(`No member found for "${ref}"`);
}
function findPlan(ref) {
  if (!ref) return null;
  const r = String(ref).toLowerCase();
  return db.plans.find((p) => p.id.toLowerCase() === r || p.name.toLowerCase() === r) || db.plans.find((p) => p.name.toLowerCase().includes(r)) || null;
}

// ---------- reads ----------
export function getState() {
  const t = today();
  return {
    today: t,
    stages: STAGES,
    leads: db.leads,
    followups: db.followups,
    members: db.members.map((m) => ({ ...m, status: memberStatus(m), days_left: Math.round((new Date(m.end) - new Date(t)) / 864e5) })),
    plans: db.plans,
    activity: db.activity.slice(0, 80),
  };
}

export function overview() {
  const t = today();
  const open = db.followups.filter((f) => f.status === 'open');
  const members = db.members.map((m) => ({ ...m, status: memberStatus(m) }));
  const month = t.slice(0, 7);
  const byStage = Object.fromEntries(STAGES.map((s) => [s, db.leads.filter((l) => l.stage === s).length]));
  const won = byStage.won, lost = byStage.lost;
  const activeLeads = db.leads.filter((l) => !['won', 'lost'].includes(l.stage));
  const noFollowup = activeLeads.filter((l) => !open.some((f) => f.lead_id === l.id));
  return {
    today: t,
    leads_by_stage: byStage,
    total_leads: db.leads.length,
    conversion_rate_pct: won + lost ? Math.round((won / (won + lost)) * 100) : 0,
    open_pipeline_value: activeLeads.reduce((s, l) => s + (+l.value || 0), 0),
    followups_overdue: open.filter((f) => f.due < t).length,
    followups_today: open.filter((f) => f.due === t).length,
    followups_next_7_days: open.filter((f) => f.due > t && f.due <= addDays(t, 7)).length,
    active_leads_with_no_followup: noFollowup.map((l) => ({ id: l.id, name: l.name, stage: l.stage })),
    members_active: members.filter((m) => m.status !== 'expired').length,
    members_expiring_14d: members.filter((m) => m.status === 'expiring').length,
    members_expired: members.filter((m) => m.status === 'expired').length,
    revenue_this_month: members.filter((m) => m.start.slice(0, 7) === month).reduce((s, m) => s + (+m.amount_paid || 0), 0),
  };
}

export function searchLeads({ query, stage, source, limit = 50 } = {}) {
  const q = (query || '').toLowerCase();
  const open = db.followups.filter((f) => f.status === 'open');
  return db.leads
    .filter((l) => (!stage || l.stage === stage) && (!source || l.source.toLowerCase() === source.toLowerCase()) &&
      (!q || [l.name, l.phone, l.email, l.goal, l.notes].join(' ').toLowerCase().includes(q)))
    .slice(0, limit)
    .map((l) => {
      const next = open.filter((f) => f.lead_id === l.id).sort((a, b) => a.due.localeCompare(b.due))[0];
      return { ...l, next_followup: next ? { id: next.id, due: next.due, channel: next.channel } : null };
    });
}

export function listFollowups({ when = 'open', lead } = {}) {
  const t = today();
  let l = db.followups;
  if (lead) { const ld = findLead(lead); l = l.filter((f) => f.lead_id === ld.id); }
  if (when === 'overdue') l = l.filter((f) => f.status === 'open' && f.due < t);
  else if (when === 'today') l = l.filter((f) => f.status === 'open' && f.due === t);
  else if (when === 'week') l = l.filter((f) => f.status === 'open' && f.due <= addDays(t, 7));
  else if (when === 'open') l = l.filter((f) => f.status === 'open');
  else if (when === 'done') l = l.filter((f) => f.status !== 'open');
  return l
    .sort((a, b) => a.due.localeCompare(b.due))
    .map((f) => { const ld = db.leads.find((x) => x.id === f.lead_id); return { ...f, lead_name: ld?.name, lead_phone: ld?.phone, lead_stage: ld?.stage }; });
}

export function listMembers({ filter = 'all' } = {}) {
  const m = getState().members;
  return filter === 'all' ? m : m.filter((x) => x.status === filter);
}

// ---------- writes ----------
export function addLead(input, actor = 'staff') {
  if (!input.name) throw new Error('Lead name is required');
  const dupe = input.phone && db.leads.find((l) => l.phone && l.phone.replace(/\D/g, '') === String(input.phone).replace(/\D/g, ''));
  if (dupe) return { duplicate: true, lead: dupe };
  const stage = STAGES.includes(input.stage) ? input.stage : 'new';
  const lead = {
    id: uid('lead'), name: '', phone: '', email: '', source: 'Other', goal: '', interested_plan: '', notes: '', owner: 'Front desk', value: 0, lost_reason: '',
    ...clean(input, LEAD_FIELDS), stage, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  if (!lead.value) lead.value = findPlan(lead.interested_plan)?.price || 0;
  db.leads.unshift(lead);
  log(`Added lead ${lead.name} (${lead.source})`, actor, { lead_id: lead.id });
  let followup = null;
  if (input.followup) followup = addFollowup({ ...input.followup, lead_id: lead.id }, actor);
  save();
  return { lead, followup };
}

export function updateLead(ref, patch, actor = 'staff') {
  const lead = findLead(ref);
  Object.assign(lead, clean(patch, LEAD_FIELDS));
  if (patch.stage) {
    if (!STAGES.includes(patch.stage)) throw new Error(`stage must be one of ${STAGES.join(', ')}`);
    if (lead.stage !== patch.stage) log(`${lead.name}: ${lead.stage} → ${patch.stage}`, actor, { lead_id: lead.id });
    lead.stage = patch.stage;
    if (['won', 'lost'].includes(lead.stage)) {
      db.followups.forEach((f) => { if (f.lead_id === lead.id && f.status === 'open') { f.status = 'skipped'; f.done_at = new Date().toISOString(); } });
    }
  }
  if (patch.note) {
    lead.notes = (lead.notes ? lead.notes + '\n' : '') + `[${today()}] ${patch.note}`;
    log(`Note on ${lead.name}: ${patch.note}`, actor, { lead_id: lead.id });
  }
  lead.updated_at = new Date().toISOString();
  save();
  return lead;
}

export function deleteLead(id) {
  const lead = db.leads.find((l) => l.id === id);
  if (!lead) throw new Error('Lead not found');
  db.leads = db.leads.filter((l) => l.id !== id);
  db.followups = db.followups.filter((f) => f.lead_id !== id);
  log(`Deleted lead ${lead.name}`);
  save();
}

export function addFollowup(input, actor = 'staff') {
  const lead = findLead(input.lead_id || input.lead);
  const channel = CHANNELS.includes(input.channel) ? input.channel : 'whatsapp';
  const fu = {
    id: uid('fu'), lead_id: lead.id, due: parseDate(input.due, addDays(today(), 1)), channel,
    purpose: (input.purpose || 'Follow up').trim(), message: (input.message || '').trim(),
    status: 'open', created_by: actor, created_at: new Date().toISOString(),
  };
  db.followups.push(fu);
  log(`Scheduled ${channel} follow-up for ${lead.name} on ${fu.due}`, actor, { lead_id: lead.id });
  save();
  return fu;
}

export function updateFollowup(id, patch, actor = 'staff') {
  const fu = db.followups.find((f) => f.id === id);
  if (!fu) throw new Error('Follow-up not found');
  const c = clean(patch, ['purpose', 'message', 'channel', 'status']);
  Object.assign(fu, c);
  if (patch.due) fu.due = parseDate(patch.due);
  save();
  return fu;
}

export function completeFollowup(id, { outcome, next, status } = {}, actor = 'staff') {
  const fu = db.followups.find((f) => f.id === id);
  if (!fu) throw new Error('Follow-up not found');
  fu.status = status === 'skipped' ? 'skipped' : 'done';
  fu.done_at = new Date().toISOString();
  fu.outcome = outcome || '';
  const lead = db.leads.find((l) => l.id === fu.lead_id);
  if (lead) {
    if (lead.stage === 'new') lead.stage = 'contacted';
    if (outcome) lead.notes = (lead.notes ? lead.notes + '\n' : '') + `[${today()}] ${outcome}`;
    lead.updated_at = new Date().toISOString();
    log(`${fu.status === 'done' ? 'Completed' : 'Skipped'} ${fu.channel} follow-up with ${lead.name}${outcome ? ': ' + outcome : ''}`, actor, { lead_id: lead.id });
  }
  let nextFu = null;
  if (next && next.due) nextFu = addFollowup({ ...next, lead_id: fu.lead_id }, actor);
  save();
  return { followup: fu, next: nextFu };
}

export function deleteFollowup(id) {
  db.followups = db.followups.filter((f) => f.id !== id);
  save();
}

export function convertToMember(leadRef, { plan, start, amount_paid, notes } = {}, actor = 'staff') {
  const lead = findLead(leadRef);
  const p = findPlan(plan || lead.interested_plan);
  if (!p) throw new Error(`Plan "${plan || lead.interested_plan}" not found. Available: ${db.plans.map((x) => x.name).join(', ')}`);
  const s = parseDate(start, today());
  const m = {
    id: uid('mem'), lead_id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, plan_id: p.id, plan_name: p.name,
    start: s, end: addDays(s, p.duration_days), amount_paid: amount_paid ?? p.price, notes: notes || '', created_at: new Date().toISOString(),
  };
  db.members.unshift(m);
  lead.stage = 'won';
  lead.updated_at = new Date().toISOString();
  db.followups.forEach((f) => { if (f.lead_id === lead.id && f.status === 'open') { f.status = 'skipped'; f.done_at = new Date().toISOString(); } });
  log(`${lead.name} joined on ${p.name} plan (₹${m.amount_paid})`, actor, { lead_id: lead.id, member_id: m.id });
  save();
  return m;
}

export function updateMember(id, patch) {
  const m = db.members.find((x) => x.id === id);
  if (!m) throw new Error('Member not found');
  Object.assign(m, clean(patch, ['name', 'phone', 'email', 'notes', 'amount_paid']));
  if (patch.start) m.start = parseDate(patch.start);
  if (patch.end) m.end = parseDate(patch.end);
  save();
  return m;
}

export function renewMember(ref, { plan, amount_paid } = {}, actor = 'staff') {
  const m = findMember(ref);
  const p = findPlan(plan) || db.plans.find((x) => x.id === m.plan_id) || db.plans[0];
  const from = m.end > today() ? m.end : today();
  m.plan_id = p.id; m.plan_name = p.name; m.start = from; m.end = addDays(from, p.duration_days);
  m.amount_paid = (+m.amount_paid || 0) + (amount_paid ?? p.price);
  log(`${m.name} renewed ${p.name} until ${m.end}`, actor, { member_id: m.id });
  save();
  return m;
}

export function deleteMember(id) {
  db.members = db.members.filter((m) => m.id !== id);
  save();
}

export function upsertPlan(input, actor = 'staff') {
  const existing = input.id ? db.plans.find((p) => p.id === input.id) : findPlan(input.name);
  if (existing && (input.id || existing.name.toLowerCase() === (input.name || '').toLowerCase())) {
    Object.assign(existing, clean(input, ['name', 'description']));
    if (input.price !== undefined) existing.price = +input.price;
    if (input.duration_days !== undefined) existing.duration_days = +input.duration_days;
    log(`Updated plan ${existing.name}`, actor);
    save();
    return existing;
  }
  if (!input.name) throw new Error('Plan name is required');
  const p = { id: uid('plan'), name: input.name.trim(), price: +input.price || 0, duration_days: +input.duration_days || 30, description: (input.description || '').trim() };
  db.plans.push(p);
  log(`Created plan ${p.name}`, actor);
  save();
  return p;
}
export function deletePlan(id) {
  db.plans = db.plans.filter((p) => p.id !== id);
  save();
}

load();
