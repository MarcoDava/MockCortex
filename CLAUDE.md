# CLAUDE.md — MockRot AI Interview Platform

This file provides guidance for AI assistants (Claude, Copilot, etc.) working in this codebase.

---

## Project Overview

**MockRot** is an AI-powered mock interview platform that uses famous internet characters (meme personas) as interviewers. The goal is to reduce interview anxiety by making practice sessions more engaging. Users select a character interviewer, paste a job description, and conduct a voice interview. AI then generates personalized feedback.

**Built for:** Macathon 2026 hackathon. Supports up to 25 concurrent users.

---

## Architecture

```
MockRot/
├── backend/              # Node.js + Express API server
│   ├── src/index.js      # Single-file server (all API routes)
│   └── .env.example      # Required environment variables
├── frontend/             # React + TypeScript + Vite SPA
│   ├── convex/           # Convex schema + server functions
│   │   ├── schema.ts     # Database schema (interviews table)
│   │   └── interviews.ts # addInterview mutation, getBySession query
│   └── src/
│       ├── main.tsx           # React entry point + ConvexProvider + session ID init
│       ├── App.tsx            # Root layout (Navbar + HexagonBackground + Footer + Outlet)
│       ├── Routes/Routes.tsx  # React Router v7 route definitions
│       ├── lib/api.ts         # API_BASE constant (VITE_API_URL env var)
│       ├── lib/convexFunctions.ts  # Type-safe Convex function references
│       ├── lib/utils.ts       # cn() Tailwind merge utility
│       ├── types/index.ts     # Shared TypeScript interfaces
│       ├── Pages/             # One file per page/route
│       └── Components/        # Reusable UI components
├── brain_service/        # Python TRIBE v2 neural analysis (runs on Colab/Kaggle)
│   ├── service.py        # FastAPI app wrapping TRIBE v2
│   ├── colab_run.py      # One-cell Colab/Kaggle setup script
│   └── requirements.txt
├── render.yaml           # Render backend deployment config
└── vercel.json           # Vercel frontend deployment config
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend UI | React 19, TypeScript, Tailwind CSS 4, shadcn/ui (New York style) |
| Routing | React Router v7 |
| Animation | Motion (Framer Motion successor) |
| Icons | Lucide React |
| Build tool | Vite 7 |
| Backend | Express 5, Node.js (ES modules) |
| Database | Convex (real-time, interview history per anonymous session) |
| AI / LLM | Google Gemini (`gemini-2.0-flash`) via `@google/generative-ai` |
| Voice TTS | ElevenLabs (`eleven_turbo_v2_5`) via `@elevenlabs/elevenlabs-js` |
| Voice cloning | ElevenLabs IVC (`elevenlabs.voices.ivc.create`) |
| Speech-to-text | Browser Web Speech API (no backend involvement) |
| Brain analysis | Meta TRIBE v2 (Python, runs on Colab/Kaggle free GPU) |
| Deployment | Vercel (frontend) + Render (backend) + Convex (database) |

---

## User Flow

1. `/` — Home page, navigate to start
2. `/characters` — Select an interviewer persona; optionally upload MP3 to clone voice via ElevenLabs IVC
3. `/jobdescription` — Paste job description; backend generates 3 interview questions
4. `/interview` — 3-second countdown → 2-minute voice recording per question (Web Speech API transcribes); webcam feed active; emotion analysis every 15 s; 10 s silence detection
5. `/feedback` — AI scores each answer (0–10), saved to Convex; optional TRIBE v2 neural brain analysis
6. `/pastinterviews` — Review history from Convex (real-time), falls back to localStorage

---

## Deployment — Three Services

### 1. Vercel (Frontend)

**One-time setup:**
1. Import the GitHub repo at vercel.com/new
2. Set these environment variables in Vercel dashboard:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | Your Render backend URL (e.g. `https://mockrot-backend.onrender.com`) |
| `VITE_CONVEX_URL` | Your Convex deployment URL (e.g. `https://xxx.convex.cloud`) |
| `CONVEX_DEPLOY_KEY` | From Convex dashboard → Settings → Deploy keys |

The `vercel.json` build command (`npx convex deploy --cmd 'npm run build'`) automatically deploys Convex functions before the Vite build, so `_generated/api` is always fresh.

---

### 2. Render (Backend)

**One-time setup:**
1. Create a new **Web Service** at render.com → connect GitHub repo
2. Render auto-detects `render.yaml` and configures the service
3. Add these environment variables in the Render dashboard:

| Variable | Value |
|----------|-------|
| `GEMINI_API_KEY` | Google AI Studio API key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `BRAIN_SERVICE_URL` | Optional: ngrok URL from Colab runner |

**Free vs paid:**
- Free tier: spins down after 15 min inactivity (30 s cold start). Fine for a hackathon demo.
- Starter ($7/mo): always-on. Recommended for 25 users in production.

---

### 3. Convex (Database)

**One-time setup:**
```bash
cd frontend
npx convex dev        # Login, create project, generates convex/_generated/
npx convex deploy     # Push schema + functions to production
```

Copy the **Deployment URL** (`https://xxx.convex.cloud`) from the dashboard → set as `VITE_CONVEX_URL` in Vercel.
Copy a **Deploy Key** → set as `CONVEX_DEPLOY_KEY` in Vercel.

**Free tier capacity (more than enough for 25 users):**
- 1 M function calls / month
- 1 GB storage
- Unlimited team members

---

### 4. Brain Service (Optional — Colab/Kaggle free GPU)

1. Open `brain_service/colab_run.py` in Google Colab or Kaggle
2. Add `HF_TOKEN` and `NGROK_TOKEN` as secrets
3. Run the cell — it prints a public URL
4. Set `BRAIN_SERVICE_URL=<url>` in Render env vars

---

## Development Setup

```bash
# Terminal 1 — Backend
cd backend
cp .env.example .env      # fill in your keys
npm install
npm run dev               # port 3000

# Terminal 2 — Convex (generates _generated/ and syncs live)
cd frontend
npx convex dev            # login on first run; keeps schema in sync

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev               # Vite dev server, port 5173
```

Set `VITE_CONVEX_URL` in `frontend/.env.local` (created automatically by `npx convex dev`).
Set `VITE_API_URL=http://localhost:3000` in `frontend/.env.local`.

---

## Backend API

All routes are in `backend/src/index.js`. The backend runs on port 3000 in development.

| Endpoint | Method | Request Body | Response |
|----------|--------|-------------|----------|
| `/api/generate-questions` | POST | `{ jobDescription, voiceId }` | `{ questions: [{question, type}] }` |
| `/api/ask-question` | POST | `{ question, voiceId }` | MP3 audio stream |
| `/api/get-feedback` | POST | `{ sessionData, voiceId }` | `{ feedback: [{score, critique}] }` |
| `/api/analyze-emotion` | POST | `{ imageBase64, voiceId }` | `{ emotion, shouldInterrupt, message }` |
| `/api/clone-voice` | POST | `{ audioBase64, mimeType, characterName }` | `{ voiceId }` |
| `/api/neural-engagement` | POST | `{ transcripts: string[] }` | `{ available, results }` |

---

## Convex Schema

```
interviews table:
  sessionId     string   (anonymous UUID from localStorage)
  date          string
  jobTitle      string
  avgScore      number
  feedback      [{score, critique}]
  questions?    string[]
  characterName? string

index: by_session on sessionId
```

**Anonymous session:** Each browser generates a UUID on first visit stored as `mockrot_session_id` in localStorage. No login required.

---

## LocalStorage Keys

| Key | Content |
|-----|---------|
| `mockrot_session_id` | Anonymous UUID (permanent, never expires) |
| `selectedVoiceId` | ElevenLabs voice ID (default or cloned) |
| `selectedCharacter` | Full character object `{id, name, img, description, key}` |
| `clonedVoice_{key}` | Cloned ElevenLabs voice ID per character |
| `interviewQuestions` | Array of `{question, type}` for current session |
| `sessionResults` | Array of `{question, answer}` from current interview |
| `interviewHistory` | localStorage fallback (used only when Convex is unavailable) |

---

## Character / Persona System

The `PERSONAS` object in `backend/src/index.js` maps ElevenLabs voice IDs to character prompts:

| Character | Voice ID | Key |
|-----------|---------|-----|
| Skibidi Toilet | `JBFqnCBsd6RMkjVDRZzb` | `skibidi` |
| Donald Trump | `ErXwobaYiN019PkySvjV` | `trump` |
| Tung Tung Sahur | `EXAVITQu4vr4xnSDxMaL` | `sahur` |

To add a new character: add an entry to `PERSONAS` in the backend AND add the character card in `frontend/src/Pages/CharactersPage/CharactersPage.tsx`.

Voice cloning: uploading an MP3 on the Characters page calls `/api/clone-voice`, stores the cloned voice ID as `clonedVoice_{key}` in localStorage, and uses it for all TTS for that session.

---

## Code Conventions

- **Components:** Functional components only, hooks for all state/effects.
- **Styling:** Tailwind utility classes directly in JSX. No CSS modules. Shared design tokens in `index.css`.
- **Path aliases:** `@/*` maps to `frontend/src/*` (configured in `vite.config.ts` and `tsconfig.app.json`).
- **shadcn/ui:** Use `npx shadcn@latest add <component>` to add new components; they land in `frontend/src/components/ui/`.
- **TypeScript strictness:** Strict mode is on (`tsconfig.app.json`). Avoid `any`.
- **Backend style:** Plain JS with ES modules (`"type": "module"` in `backend/package.json`). No TypeScript in backend.
- **Convex functions:** Use `makeFunctionReference` from `convex/server` in `src/lib/convexFunctions.ts` rather than importing `_generated/api` directly — this works before `npx convex dev` is run.
- **No test suite.** Manual testing only.

---

## Important Notes for AI Assistants

- **Convex `_generated/` folder** is git-ignored and created by `npx convex dev`. Never import from it directly in source — use `convexFunctions.ts`.
- **Backend uses `@google/generative-ai` v0.24.1** — use `GoogleGenerativeAI` class, not `@google/genai`.
- **Audio streaming:** `/api/ask-question` streams MP3 directly. Do not change to JSON.
- **Web Speech API** is Chrome/Webkit only. No polyfill.
- **Character images** are from Discord/Google CDNs. Update URLs in `CharactersPage.tsx` if broken.
- **Gemini models:** `gemini-2.0-flash` for Q-gen + feedback; `gemini-2.0-flash-lite` for emotion analysis.
- **Brain service** is optional. If `BRAIN_SERVICE_URL` is unset, `/api/neural-engagement` returns `{available: false}` and the Feedback page hides the neural section gracefully.
