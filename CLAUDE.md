# CLAUDE.md — MockRot AI Interview Platform

This file provides guidance for AI assistants (Claude, Copilot, etc.) working in this codebase.

---

## Project Overview

**MockRot** is an AI-powered mock interview platform that uses famous internet characters (meme personas) as interviewers. The goal is to reduce interview anxiety by making practice sessions more engaging. Users select a character interviewer, paste a job description, and conduct a voice interview. AI then generates personalized feedback.

**Built for:** Macathon 2026 hackathon.

---

## Architecture

```
MockRot/
├── backend/          # Node.js + Express API server
│   └── src/
│       └── index.js  # Single-file server (all API routes)
├── frontend/         # React + TypeScript + Vite SPA
│   └── src/
│       ├── main.tsx           # React entry point
│       ├── App.tsx            # Root layout (Navbar + HexagonBackground + Footer + Outlet)
│       ├── Routes/Routes.tsx  # React Router v7 route definitions
│       ├── Pages/             # One file per page/route
│       └── Components/        # Reusable UI components
└── vercel.json       # Deployment config (rewrites /api/* to serverless)
```

**No database.** All session state is stored in `localStorage`.

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
| AI / LLM | Google Gemini (`gemini-3-flash-preview`) via `@google/generative-ai` |
| Voice TTS | ElevenLabs (`eleven_turbo_v2_5`) via `@elevenlabs/elevenlabs-js` |
| Speech-to-text | Browser Web Speech API (no backend involvement) |
| Deployment | Vercel |

---

## User Flow

1. `/` — Home page, navigate to start
2. `/characters` — Select an interviewer persona (Skibidi Toilet, Donald Trump, Tung Tung Sahur)
3. `/jobdescription` — Paste job description; backend generates 3 interview questions
4. `/interview` — 3-second countdown → 2-minute voice recording per question (Web Speech API transcribes)
5. `/feedback` — AI scores each answer (0–10) and provides in-character critique
6. `/pastinterviews` — Review localStorage history of completed sessions

---

## Backend API

All routes are in `backend/src/index.js`. The backend runs on port 3000 in development.

| Endpoint | Method | Request Body | Response |
|----------|--------|-------------|----------|
| `/api/generate-questions` | POST | `{ jobDescription, voiceId }` | `{ questions: [{question, type}] }` |
| `/api/ask-question` | POST | `{ question, voiceId }` | MP3 audio stream |
| `/api/get-feedback` | POST | `{ sessionData, voiceId }` | `{ feedback: [{score, critique}] }` |

**`voiceId`** is the ElevenLabs voice ID, used as the key to look up the character's persona in the `PERSONAS` object. All three AI behaviors (question style, TTS voice, feedback tone) derive from this single identifier.

---

## Character / Persona System

The `PERSONAS` object in `backend/src/index.js` maps ElevenLabs voice IDs to character prompts:

| Character | Voice ID |
|-----------|---------|
| Skibidi Toilet | `JBFqnCBsd6RMkjVDRZzb` |
| Donald Trump | `ErXwobaYiN019PkySvjV` |
| Tung Tung Sahur | `EXAVITQu4vr4xnSDxMaL` |

To add a new character: add an entry to `PERSONAS` in the backend AND add the character card in `frontend/src/Pages/CharactersPage.tsx`.

---

## Environment Variables

Create a `.env` file in `backend/` (never commit it):

```
GEMINI_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
```

Neither the frontend nor Vercel config exposes these — they are server-side only.

---

## LocalStorage Keys

| Key | Content |
|-----|---------|
| `selectedVoiceId` | ElevenLabs voice ID string |
| `selectedCharacter` | Full character object `{name, image, description}` |
| `interviewQuestions` | Array of `{question, type}` from backend |
| `sessionResults` | Array of `{question, transcript, audioBlob}` collected during interview |
| `interviewHistory` | Array of past sessions (appended on feedback page) |

Data flows forward through pages via `localStorage`; there is no global state manager (no Redux/Zustand/Context).

---

## Development Setup

```bash
# Backend
cd backend
npm install
npm run dev        # tsx src/index.js on port 3000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev        # Vite dev server (usually port 5173)
```

The frontend proxies `/api/*` requests to the backend in development via Vite config (or direct fetch to `http://localhost:3000`).

---

## Build & Deployment

```bash
# Frontend
cd frontend
npm run build      # tsc -b && vite build → dist/

# Backend
# Deployed as Vercel serverless function; vercel.json rewrites /api/* → /api/index.js
```

Vercel handles both frontend static hosting and backend API routes from the same project.

---

## Code Conventions

- **Components:** Functional components only, hooks for all state/effects.
- **Styling:** Tailwind utility classes directly in JSX. No CSS modules. Shared design tokens in `index.css`.
- **Path aliases:** `@/*` maps to `frontend/src/*` (configured in `vite.config.ts` and `tsconfig.app.json`).
- **shadcn/ui:** Use `npx shadcn@latest add <component>` to add new components; they land in `frontend/src/components/ui/`.
- **TypeScript strictness:** Strict mode is on (`tsconfig.app.json`). Avoid `any`; existing uses are legacy.
- **Backend style:** Plain JS with ES modules (`"type": "module"` in `backend/package.json`). No TypeScript in backend at runtime.
- **No test suite.** There are no unit or integration tests. Manual testing only.

---

## Important Notes for AI Assistants

- **Do not add a database** unless explicitly asked — localStorage is intentional for this hackathon scope.
- **Do not abstract** the single-file backend into multiple modules unless asked; the simplicity is intentional.
- **Backend uses `@google/generative-ai` v0.24.1** — use the `GoogleGenerativeAI` class, not the newer `@google/genai` package (both are installed but only the former is actively used).
- **Audio streaming:** `/api/ask-question` streams an MP3 directly; the frontend creates a `Blob` URL from the response. Do not change to JSON response format.
- **Web Speech API** is used for recording — this is Chrome/Webkit only. No polyfill exists in the project.
- **Character images** are loaded from external CDNs (Discord, Google). If images break, update the URLs in `CharactersPage.tsx`.
- **Unused files:** `backend/InterviewQuestionGenerator.js` and `backend/audio_to_file.mts` are fully commented out — do not restore or rely on them.
- **Gemini model name:** Currently `"gemini-3-flash-preview"` — check for deprecation if API calls fail.
