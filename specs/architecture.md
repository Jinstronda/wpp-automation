📲 WhatsApp Automation System — Architecture
✅ Features

Automates WhatsApp Web via Playwright

Creates new contacts and opens chats automatically

Custom prompts per business ({{business}} injected)

AI responds to replies (Claude / OpenAI)

CSV or Google Sheets import for leads

Delayed, randomized message sending

Retry + follow-ups for non-repliers

Tracks all state in local JSON file (resume on restart)

Prompt stats tracking (per variant success rates)

Optional React/Vite UI for settings and logs

Runs locally inside Conda env:

conda activate turing0.1

📂 Folder Structure
C:\Users\joaop\Documents\Automations\Wpp Automation
│
├── src/
│   ├── automation/
│   │   ├── whatsappController.ts      # Browser + chat automation
│   │   ├── contactManager.ts         # Add/search contacts
│   │   └── followupHandler.ts        # Retry + scheduled follow-ups
│   │
│   ├── ai/
│   │   ├── messageGenerator.ts       # AI prompt creation
│   │   └── aiResponder.ts            # AI reply logic
│   │
│   ├── scheduler/
│   │   └── campaignScheduler.ts      # Delays + retries
│   │
│   ├── ui/
│   │   └── App.tsx                   # Optional local web UI
│   │
│   ├── config/
│   │   ├── prompts.json              # Prompt variants ({{business}})
│   │   └── settings.json             # Delay, retries, etc
│   │
│   ├── data/
│   │   ├── leads.csv                 # Input leads
│   │   ├── message_logs.json         # All message history
│   │   └── prompt_stats.json         # Success metrics
│   │
│   ├── state/
│   │   └── sessionStore.ts           # Campaign state (sent, replied, etc.)
│   │
│   ├── utils/
│   │   ├── fileUtils.ts
│   │   ├── delayUtils.ts
│   │   └── logger.ts
│   │
│   └── index.ts                      # Entrypoint
│
├── specs/
│   └── architecture.md               # This document
│
├── playwright.config.ts
├── package.json
├── tsconfig.json
├── .env
└── README.md

🧩 Component Responsibilities
Automation Layer

whatsappController.ts → Core Playwright automation:
open chats, detect UI elements, send messages.

contactManager.ts → Create new contacts when not already in chat history.

followupHandler.ts → Queue follow-up messages for non-repliers.

AI Layer

messageGenerator.ts → Generate initial outreach messages with business context injected into prompts.

aiResponder.ts → Handle AI-driven replies after the contact responds.

Scheduler

campaignScheduler.ts → Randomized delays, retry scheduling, campaign timing.

UI Layer (optional)

App.tsx → React/Vite-based local configuration UI:

Upload leads

Configure delays/prompts

View campaign logs

Config

prompts.json → Prompt templates using {{business}} placeholders.

settings.json → Controls delays, retries, model used, etc.

Data

leads.csv → Input file of businesses/leads.

message_logs.json → Append-only log of messages sent.

prompt_stats.json → Aggregated statistics for prompt performance.

State

sessionStore.ts → Manage campaign state in-memory and persist to state/session.json.
Tracks:

Current status (not_contacted, sent, replied, follow_up)

Last prompt used

Last message timestamp

Utils

fileUtils.ts → CSV and JSON helpers.

delayUtils.ts → Randomized wait times.

logger.ts → Logging abstraction (console + file).

🔄 Flow Overview
[CSV Input: leads.csv]
        ↓
[Contact Manager → Create/Open Chat]
        ↓
[Send Prompt (inject business name)]
        ↓
[Wait for Reply]
        ↓
[AI Responder generates response]
        ↓
[Send AI Response with Delay]
        ↓
[Follow-up Handler if no reply]
        ↓
[State + Stats updated in JSON]

🧩 State Management

State is centralized in sessionStore.ts and mirrored in state/session.json.

On restart, the campaign resumes from last saved state.

Data tracked per contact:

phone

businessName

promptVariant

status (not_contacted, sent, replied, follow_up)

lastMessageAt

📊 Analytics & Stats

message_logs.json → Each message with { phone, timestamp, promptVariant, aiGenerated: true|false }

prompt_stats.json → Aggregate counts per prompt variant:

{
  "variant1": { "sent": 10, "replied": 3 },
  "variant2": { "sent": 5, "replied": 2 }
}

🛠 Tech Stack

Playwright → WhatsApp Web automation

TypeScript → Core language

Node.js → Runtime

Claude/OpenAI API → AI messaging

CSV-Parser / Google Sheets API → Lead import

React/Vite → Optional UI

dotenv → Env var management