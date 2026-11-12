# FitLoop: gym sales follow-up & member desk (runs on Claude, no AI inside)

Claude (the customer's own plan) reads messy enquiries, qualifies leads, writes WhatsApp/email/call scripts and plans timing.
FitLoop stores everything, lets staff edit and send it, tracks members and renewals, and stays live after the chat ends.

## Run locally
    npm install && npm start        # http://localhost:3000   login: demo / gold2026

## Deploy (any Node host: Render, Railway, Fly)
Render: push to GitHub, "New Blueprint" with render.yaml. Or use the Dockerfile.
Env vars: ADMIN_USER, ADMIN_PASS, MCP_KEY (long random string), DATA_DIR (a persistent disk path for db.json).

## Connect to Claude
MCP URL: https://YOUR-APP-URL/mcp/YOUR_MCP_KEY
Claude → Settings → Connectors → Add custom connector → paste URL.
The same link is shown inside the app under "Connect Claude".

## Demo prompts
1. "Add these enquiries: Rahul 98765 43210 (Instagram, fat loss), Meera walked in asking about yoga + PT. Draft a first WhatsApp for each, send tomorrow."
2. "Check overdue follow-ups and rewrite the messages shorter and friendlier."
3. "Who is expiring within 2 weeks? Draft renewal messages with a small offer."

## MCP tools
get_overview, add_leads, search_leads, update_lead, schedule_followups, list_followups, update_followup,
complete_followup, list_plans, upsert_plan, convert_to_member, list_members, renew_member

## No AI inside
No AI SDKs or keys. Dependencies: express, zod, @modelcontextprotocol/sdk. Storage: one JSON file.
