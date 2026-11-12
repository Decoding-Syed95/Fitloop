// FitLoop: web app + MCP server. No AI keys, no AI calls anywhere in this file.
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as S from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'demo';
const ADMIN_PASS = process.env.ADMIN_PASS || 'gold2026';
const MCP_KEY = process.env.MCP_KEY || 'fitloop-demo-key-change-me';
const SECRET = process.env.SESSION_SECRET || crypto.createHash('sha256').update(ADMIN_PASS + MCP_KEY).digest('hex');

const app = express();
app.use(express.json({ limit: '1mb' }));

// ---------------- MCP ----------------
const text = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const wrap = (fn) => async (args) => {
  try { return text(await fn(args)); }
  catch (e) { return { isError: true, content: [{ type: 'text', text: 'Error: ' + e.message }] }; }
};
const dateHint = 'Dates: YYYY-MM-DD, or "today", "tomorrow", "+3d".';
const followupShape = z.object({
  due: z.string().describe('When to follow up. ' + dateHint),
  channel: z.enum(S.CHANNELS).default('whatsapp'),
  purpose: z.string().describe('Short reason, e.g. "Close after trial"'),
  message: z.string().describe('The ready-to-send message or call script, written by you. Warm, short, specific to this person.'),
});

function buildMcp() {
  const server = new McpServer({ name: 'fitloop', version: '1.0.0' }, {
    instructions:
      'FitLoop is the sales follow-up and member management desk for a gym / fitness studio. ' +
      'You (Claude) do the thinking and writing: parse messy lead notes, qualify leads, draft personal WhatsApp/email/call scripts, and decide follow-up timing. ' +
      'FitLoop stores everything so staff can review, edit and send. Start with get_overview to see today\'s date and what needs attention. ' +
      'Always attach a follow-up (with a written message) when you add or advance a lead.',
  });

  server.registerTool('get_overview', {
    description: 'Dashboard snapshot: today\'s date, leads per stage, overdue/today follow-ups, leads with no follow-up, expiring memberships, revenue. Call this first.',
    inputSchema: {},
  }, wrap(() => S.overview()));

  server.registerTool('add_leads', {
    description: 'Add one or many new leads (e.g. parsed from a pasted list, DM screenshot text, or enquiry form). Duplicates by phone are skipped. Optionally attach a first follow-up with a message you drafted.',
    inputSchema: {
      leads: z.array(z.object({
        name: z.string(),
        phone: z.string().optional(),
        email: z.string().optional(),
        source: z.string().optional().describe('Instagram, Walk-in, Referral, Google Ads, Facebook, Website...'),
        goal: z.string().optional().describe('Fitness goal, e.g. Fat loss'),
        interested_plan: z.string().optional().describe('Name of a plan from list_plans'),
        stage: z.enum(S.STAGES).optional(),
        notes: z.string().optional(),
        value: z.number().optional().describe('Expected deal value in ₹'),
        followup: followupShape.optional(),
      })).min(1).max(50),
    },
  }, wrap(({ leads }) => {
    const results = leads.map((l) => S.addLead(l, 'claude'));
    return {
      added: results.filter((r) => !r.duplicate).map((r) => ({ id: r.lead.id, name: r.lead.name, followup_due: r.followup?.due })),
      skipped_duplicates: results.filter((r) => r.duplicate).map((r) => r.lead.name),
    };
  }));

  server.registerTool('search_leads', {
    description: 'Find leads by text, stage or source. Returns each lead with its next open follow-up.',
    inputSchema: { query: z.string().optional(), stage: z.enum(S.STAGES).optional(), source: z.string().optional() },
  }, wrap((a) => S.searchLeads(a)));

  server.registerTool('update_lead', {
    description: 'Change a lead\'s stage, details, or append a note. Moving to "lost" closes open follow-ups (give lost_reason). Identify the lead by id or name.',
    inputSchema: {
      lead: z.string().describe('Lead id or name'),
      stage: z.enum(S.STAGES).optional(),
      phone: z.string().optional(), email: z.string().optional(), goal: z.string().optional(),
      interested_plan: z.string().optional(), value: z.number().optional(), lost_reason: z.string().optional(),
      note: z.string().optional().describe('Appended to the lead\'s notes with today\'s date'),
    },
  }, wrap(({ lead, ...patch }) => S.updateLead(lead, patch, 'claude')));

  server.registerTool('schedule_followups', {
    description: 'Schedule one or more follow-ups, each with a message/script you wrote. Staff will see them in the Follow-ups queue and can edit before sending.',
    inputSchema: {
      followups: z.array(followupShape.extend({ lead: z.string().describe('Lead id or name') })).min(1).max(50),
    },
  }, wrap(({ followups }) => followups.map((f) => {
    const fu = S.addFollowup({ ...f, lead_id: f.lead }, 'claude');
    return { id: fu.id, lead: f.lead, due: fu.due, channel: fu.channel };
  })));

  server.registerTool('list_followups', {
    description: 'List follow-ups. when: overdue | today | week | open | done. Includes lead name, phone and the drafted message. Use this to plan the day or to rewrite stale messages.',
    inputSchema: { when: z.enum(['overdue', 'today', 'week', 'open', 'done']).default('open'), lead: z.string().optional() },
  }, wrap((a) => S.listFollowups(a)));

  server.registerTool('update_followup', {
    description: 'Rewrite the message, reschedule, or change the channel of an existing follow-up.',
    inputSchema: { id: z.string(), due: z.string().optional(), channel: z.enum(S.CHANNELS).optional(), purpose: z.string().optional(), message: z.string().optional() },
  }, wrap(({ id, ...p }) => S.updateFollowup(id, p, 'claude')));

  server.registerTool('complete_followup', {
    description: 'Mark a follow-up done (or skipped) with the outcome, and optionally schedule the next one in the same call.',
    inputSchema: {
      id: z.string(), outcome: z.string().optional(), skipped: z.boolean().optional(),
      next: followupShape.optional(),
    },
  }, wrap(({ id, outcome, skipped, next }) => S.completeFollowup(id, { outcome, next, status: skipped ? 'skipped' : 'done' }, 'claude')));

  server.registerTool('list_plans', { description: 'Membership plans with price and duration.', inputSchema: {} }, wrap(() => S.getState().plans));

  server.registerTool('upsert_plan', {
    description: 'Create a membership plan, or update one with the same name/id.',
    inputSchema: { id: z.string().optional(), name: z.string(), price: z.number(), duration_days: z.number(), description: z.string().optional() },
  }, wrap((a) => S.upsertPlan(a, 'claude')));

  server.registerTool('convert_to_member', {
    description: 'Lead joined. Creates a membership (start/end dates from the plan), marks the lead won and closes open follow-ups.',
    inputSchema: { lead: z.string(), plan: z.string().optional().describe('Plan name or id; defaults to the lead\'s interested plan'), start: z.string().optional(), amount_paid: z.number().optional(), notes: z.string().optional() },
  }, wrap(({ lead, ...o }) => S.convertToMember(lead, o, 'claude')));

  server.registerTool('list_members', {
    description: 'List members with status. filter: all | active | expiring (ends within 14 days) | expired. Use for renewal campaigns.',
    inputSchema: { filter: z.enum(['all', 'active', 'expiring', 'expired']).default('all') },
  }, wrap((a) => S.listMembers(a)));

  server.registerTool('renew_member', {
    description: 'Extend a membership from its end date (or today if expired) and record the payment.',
    inputSchema: { member: z.string().describe('Member id or name'), plan: z.string().optional(), amount_paid: z.number().optional() },
  }, wrap(({ member, ...o }) => S.renewMember(member, o, 'claude')));

  return server;
}

async function handleMcp(req, res) {
  if (req.params.key !== MCP_KEY) return res.status(401).json({ error: 'Invalid MCP key' });
  const server = buildMcp();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null });
  }
}
app.post('/mcp/:key', handleMcp);
app.get('/mcp/:key', (req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }));
app.delete('/mcp/:key', (req, res) => res.status(405).end());

// ---------------- Auth (web app) ----------------
const sign = (v) => v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const verify = (t) => { if (!t) return false; const [v, h] = t.split('.'); return h && sign(v) === t && +v > Date.now(); };
const cookie = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]));
const guard = (req, res, next) => (verify(cookie(req).fl_session) ? next() : res.status(401).json({ error: 'Not signed in' }));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const tok = sign(String(Date.now() + 7 * 864e5));
    res.setHeader('Set-Cookie', `fl_session=${tok}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 86400}`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Wrong username or password' });
});
app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', 'fl_session=; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', guard, (req, res) => res.json({ ok: true }));

// ---------------- REST API for the UI ----------------
const api = express.Router();
api.use(guard);
const h = (fn) => (req, res) => { try { res.json(fn(req) ?? { ok: true }); } catch (e) { res.status(400).json({ error: e.message }); } };

api.get('/state', h(() => S.getState()));
api.get('/overview', h(() => S.overview()));
api.get('/connect-info', h((req) => ({ mcp_url: `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}/mcp/${MCP_KEY}` })));

api.post('/leads', h((r) => { const x = S.addLead(r.body); if (x.duplicate) throw new Error(`Duplicate: ${x.lead.name} already has this phone number`); return x.lead; }));
api.patch('/leads/:id', h((r) => S.updateLead(r.params.id, r.body)));
api.delete('/leads/:id', h((r) => S.deleteLead(r.params.id)));
api.post('/leads/:id/convert', h((r) => S.convertToMember(r.params.id, r.body)));

api.post('/followups', h((r) => S.addFollowup(r.body)));
api.patch('/followups/:id', h((r) => S.updateFollowup(r.params.id, r.body)));
api.post('/followups/:id/complete', h((r) => S.completeFollowup(r.params.id, r.body)));
api.delete('/followups/:id', h((r) => S.deleteFollowup(r.params.id)));

api.patch('/members/:id', h((r) => S.updateMember(r.params.id, r.body)));
api.post('/members/:id/renew', h((r) => S.renewMember(r.params.id, r.body)));
api.delete('/members/:id', h((r) => S.deleteMember(r.params.id)));

api.post('/plans', h((r) => S.upsertPlan(r.body)));
api.patch('/plans/:id', h((r) => S.upsertPlan({ ...r.body, id: r.params.id })));
api.delete('/plans/:id', h((r) => S.deletePlan(r.params.id)));
app.use('/api', api);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (req, res) => res.send('ok'));

app.listen(PORT, () => console.log(`FitLoop running on :${PORT}`));
process.on('SIGTERM', () => { S.flush(); process.exit(0); });
