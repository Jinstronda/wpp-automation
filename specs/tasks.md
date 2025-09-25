✅ WhatsApp Automation — Task Plan

Environment:

conda activate turing0.1


Agents Used:

Sequential Thinking MCP → reasoning + planning

Desktop Commander → terminal + filesystem

Playwright → browser automation + testing

Process Rules:

Sequential only — do not skip tasks.

Testable metrics — each task must define success criteria.

Checkpoints — every few tasks, run system-wide tests.

Documentation — end each checkpoint with a written log of what worked, what failed, what was learned.

Strict gating — only move forward when the previous task passes.

🟦 Phase 1: Project Setup

Initialize Project

Create TS project + folders.

✔ Metric: tree /F shows src/automation, src/ai, src/config, src/state, src/data, src/ui.

Install Dependencies

Install playwright, typescript, ts-node, dotenv, csv-parser, react, vite, tailwind.

✔ Metric: npm list playwright react vite succeeds.

Setup tsconfig

Configure to compile into dist/.

✔ Metric: tsc compiles dummy .ts with no errors.

Bootstrap Required Folders

index.ts ensures /data, /logs, /state exist.

✔ Metric: Run ts-node index.ts, folders created.

🧪 Checkpoint 1 — System Sanity

Run: ts-node index.ts

Verify: No errors, folders exist.

Document findings in specs/docs/iteration-1.md.

🟩 Phase 2: WhatsApp Automation (Playwright)

Launch WhatsApp Web

✔ Metric: Browser shows WA QR.

Persist Session

✔ Metric: Restart without QR scan.

Detect Sidebar + Search

✔ Metric: Selectors found.

Search Contact

✔ Metric: Opens correct chat.

Send Static Message

✔ Metric: “Hello from automation” appears.

🧪 Checkpoint 2 — WhatsApp Core

Send test message to known contact.

Document selectors + screenshots.

🟨 Phase 3: CSV Import + Contact Creation

Parse Leads CSV

✔ Metric: Logs [ { name, phone, businessName, promptVariant } ].

Click “New Chat”

✔ Metric: New chat modal opens.

Click “New Contact”

✔ Metric: Form visible.

Create Contact

✔ Metric: Contact appears in sidebar.

Open Chat with New Contact

✔ Metric: Chat shows new name.

🧪 Checkpoint 3 — Contact Creation

Import CSV with 1 contact.

Verify created + opened.

Document in specs/docs/iteration-3.md.

🟥 Phase 4: Prompt Injection

Load Prompts JSON

✔ Metric: JSON object loaded.

Inject Business Name

✔ Metric: "Hi Panizzutti Fit".

Send Customized Prompt

✔ Metric: Message appears in WA.

🧪 Checkpoint 4 — Prompt Test

Import 2 leads, verify correct personalization.

Document behavior.

🟪 Phase 5: AI Reply Handling

Detect New Incoming Message

✔ Metric: Logs "New message: …".

Extract Last Message

✔ Metric: Returns "Yes, tell me more".

Send to AI

✔ Metric: Response string returned.

Send AI Response

✔ Metric: Appears in WA.

🧪 Checkpoint 5 — Conversation Flow

Prompt → reply → AI → response.

Document quality + timing.

🟫 Phase 6: Delays + Follow-ups

Randomized Delay

✔ Metric: Messages spaced randomly.

Retry Queue

✔ Metric: State shows "follow_up".

Send Follow-up

✔ Metric: Second msg appears.

🧪 Checkpoint 6 — Follow-up

Run 1h idle test.

Verify follow-up sent.

Document reliability.

🟧 Phase 7: State Management

Track Per-Lead State

✔ Metric: JSON shows { phone, status, lastPrompt }.

Persist State to Disk

✔ Metric: state/session.json updates every 5 min.

Resume on Restart

✔ Metric: Campaign resumes correctly.

🟨 Phase 8: Analytics

Log Messages

✔ Metric: message_logs.json updated.

Track Prompt Stats

✔ Metric: { "variant1": { "sent": 10, "replied": 4 } }.

🟦 Phase 9: User Interface (MANDATORY)

Bootstrap React UI

Create Vite+React+Tailwind app in /src/ui.

✔ Metric: npm run dev shows “UI running”.

Upload CSV + Preview

✔ Metric: Table with leads visible.

Settings Form

Configure delay, retries, prompt selection.

✔ Metric: Updates config/settings.json.

Live Logs Viewer

✔ Metric: Browser updates in real-time with logs.

Campaign Control Panel

Start/stop campaign via UI button.

✔ Metric: Trigger updates automation state.

🧪 Checkpoint 7 — Full System Test

Run full flow: Import CSV → Create contact → Send prompt → Reply → AI → Follow-up → UI shows logs.

Document end-to-end behavior in specs/docs/iteration-7.md.

🔄 Continuous Documentation

At each checkpoint, create:

specs/docs/iteration-N.md with:

What was tested

Results (logs, screenshots)

Issues

Fixes applied

Lessons learned

This ensures AI stays aligned and progress is fully traceable.