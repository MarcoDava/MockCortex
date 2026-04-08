import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFile, unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
const hasElevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY?.trim());
const hasBrainServiceConfig = Boolean(
  process.env.BRAIN_SERVICE_URL?.trim() && process.env.BRAIN_SERVICE_API_KEY?.trim()
);

const genAI = hasGeminiKey ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const elevenlabs = hasElevenLabsKey ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }) : null;

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_SECRET_PATTERN = /^[0-9a-f]{64}$/i;
const ELEVENLABS_VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const POW_SOLUTION_PATTERN = /^\d{1,12}$/;
const SESSION_COOKIE_NAME = 'mockcortex_api_session';
const MAX_TEXT_LENGTH = 6_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPTS = 5;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const REQUEST_PROOF_TTL_MS = 2 * 60 * 1000;
const SESSION_POW_DIFFICULTY = Math.min(
  6,
  Math.max(3, Number.parseInt(process.env.SESSION_POW_DIFFICULTY ?? '4', 10) || 4)
);
const REQUEST_PROOF_DIFFICULTIES = {
  'ask-question': 3,
  'parse-resume': 4,
  'generate-questions': 4,
  'get-feedback': 4,
  'neural-engagement': 4,
  'clone-voice': 5,
  'clone-voice-youtube': 5,
};
const sessionSigningSecret = process.env.SESSION_SIGNING_SECRET?.trim() || randomBytes(32).toString('hex');

if (!process.env.SESSION_SIGNING_SECRET?.trim()) {
  console.warn('SESSION_SIGNING_SECRET is not set; generated a temporary signing secret for this process.');
}

const allowedOrigins = new Set(
  [
    'http://localhost:5173',
    process.env.FRONTEND_ORIGIN,
    ...(process.env.ADDITIONAL_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ].filter(Boolean)
);

const cloneMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]);

const rateLimitStore = new Map();
const challengeStore = new Map();
const requestProofStore = new Map();

function addSecurityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

function corsOriginValidator(origin, callback) {
  if (!origin) {
    callback(null, false);
    return;
  }

  if (allowedOrigins.has(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error('Origin not allowed by CORS'));
}

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function isSecureRequest(req) {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return forwardedProto === 'https' || req.secure;
}

function requireAllowedOrigin(req, res, next) {
  const origin = req.get('origin')?.trim();
  if (!origin || !allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  next();
}

function createRateLimiter({ windowMs, max, keySuffix }) {
  return (req, res, next) => {
    const key = `${keySuffix}:${getRequestIp(req)}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt <= now) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
      return;
    }

    entry.count += 1;
    next();
  };
}

function estimateBase64Bytes(base64Value) {
  if (typeof base64Value !== 'string' || base64Value.length === 0) return 0;
  const sanitized = base64Value.replace(/\s+/g, '');
  const padding = sanitized.endsWith('==') ? 2 : sanitized.endsWith('=') ? 1 : 0;
  return Math.floor((sanitized.length * 3) / 4) - padding;
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeResumeSummary(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    name: sanitizeText(raw.name ?? '', 120),
    experience: sanitizeText(raw.experience ?? '', 1_500),
    education: sanitizeText(raw.education ?? '', 300),
    skills: Array.isArray(raw.skills)
      ? raw.skills.map((skill) => sanitizeText(skill, 80)).filter(Boolean).slice(0, 10)
      : [],
    highlights: Array.isArray(raw.highlights)
      ? raw.highlights.map((item) => sanitizeText(item, 160)).filter(Boolean).slice(0, 5)
      : [],
  };
}

function parseSessionData(rawSessionData) {
  if (!Array.isArray(rawSessionData) || rawSessionData.length === 0 || rawSessionData.length > MAX_TRANSCRIPTS) {
    throw new Error('sessionData must contain between 1 and 5 answers');
  }

  return rawSessionData.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('sessionData entries must be objects');
    }

    return {
      question: sanitizeText(entry.question ?? '', 400),
      answer: sanitizeText(entry.answer ?? '', 4_000),
    };
  });
}

function parseTranscripts(rawTranscripts) {
  if (!Array.isArray(rawTranscripts) || rawTranscripts.length === 0 || rawTranscripts.length > MAX_TRANSCRIPTS) {
    throw new Error('transcripts must contain between 1 and 5 answers');
  }

  return rawTranscripts.map((value) => sanitizeText(value, 4_000)).filter(Boolean);
}

function parseVoiceId(value) {
  if (value == null || value === '') return 'sB7vwSCyX0tQmU24cW2C';
  if (typeof value !== 'string' || !ELEVENLABS_VOICE_ID_PATTERN.test(value.trim())) {
    throw new Error('voiceId is invalid');
  }
  return value.trim();
}

function parseClonePayload(audioBase64, mimeType) {
  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
    throw new Error('Audio sample is required');
  }
  const normalizedMimeType = sanitizeText(mimeType || 'audio/mpeg', 64).toLowerCase();
  if (!cloneMimeTypes.has(normalizedMimeType)) {
    throw new Error('Unsupported audio format');
  }
  const byteSize = estimateBase64Bytes(audioBase64);
  if (byteSize <= 0 || byteSize > MAX_AUDIO_BYTES) {
    throw new Error('Audio sample exceeds the 8 MB limit');
  }
  return normalizedMimeType;
}

function parseYouTubeUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Please provide a valid YouTube URL.');
  }

  let url;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error('Please provide a valid YouTube URL.');
  }

  const hostname = url.hostname.toLowerCase();
  const isYouTubeHost =
    hostname === 'youtu.be' ||
    hostname === 'www.youtube.com' ||
    hostname === 'youtube.com' ||
    hostname === 'm.youtube.com';
  const isValidPath = hostname === 'youtu.be'
    ? url.pathname.length > 1
    : url.pathname === '/watch' && url.searchParams.has('v');

  if (!isYouTubeHost || !isValidPath) {
    throw new Error('Please provide a valid YouTube URL.');
  }

  return url.toString();
}

function hashSessionSecret(sessionSecret) {
  return createHash('sha256').update(sessionSecret).digest('hex');
}

function signTokenPayload(encodedPayload) {
  return createHmac('sha256', sessionSigningSecret).update(encodedPayload).digest('base64url');
}

function createSessionToken(sessionId, sessionSecret) {
  const encodedPayload = Buffer.from(
    JSON.stringify({
      sid: sessionId,
      shash: hashSessionSecret(sessionSecret),
      exp: Date.now() + SESSION_TTL_MS,
    })
  ).toString('base64url');
  return `${encodedPayload}.${signTokenPayload(encodedPayload)}`;
}

function verifySessionToken(token) {
  if (typeof token !== 'string') return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signTokenPayload(encodedPayload);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (
    !payload ||
    !SESSION_ID_PATTERN.test(payload.sid) ||
    !SESSION_SECRET_PATTERN.test(payload.shash) ||
    typeof payload.exp !== 'number' ||
    payload.exp <= Date.now()
  ) {
    return null;
  }

  return payload;
}

function getCookie(req, cookieName) {
  const rawCookieHeader = req.get('cookie');
  if (!rawCookieHeader) return '';
  const cookies = rawCookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name === cookieName) {
      return rest.join('=');
    }
  }
  return '';
}

function setSessionCookie(req, res, token) {
  const secure = isSecureRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/api',
  });
}

function pruneExpiredChallenges() {
  const now = Date.now();
  for (const [challengeId, challenge] of challengeStore.entries()) {
    if (challenge.expiresAt <= now) {
      challengeStore.delete(challengeId);
    }
  }
}

function pruneExpiredRequestProofs() {
  const now = Date.now();
  for (const [proofId, proof] of requestProofStore.entries()) {
    if (proof.expiresAt <= now) {
      requestProofStore.delete(proofId);
    }
  }
}

function verifyProofOfWork(challengeId, nonce, solution) {
  if (!POW_SOLUTION_PATTERN.test(solution)) {
    return false;
  }
  const digest = createHash('sha256')
    .update(`${challengeId}:${nonce}:${solution}`)
    .digest('hex');
  return digest.startsWith('0'.repeat(SESSION_POW_DIFFICULTY));
}

function verifyActionProof(proofId, nonce, solution, difficulty) {
  if (!POW_SOLUTION_PATTERN.test(solution)) {
    return false;
  }
  const digest = createHash('sha256')
    .update(`${proofId}:${nonce}:${solution}`)
    .digest('hex');
  return digest.startsWith('0'.repeat(difficulty));
}

function requireRequestProof(action) {
  return (req, res, next) => {
    pruneExpiredRequestProofs();

    const proofId = req.get('x-mockcortex-proof-id')?.trim() ?? '';
    const nonce = req.get('x-mockcortex-proof-nonce')?.trim() ?? '';
    const solution = req.get('x-mockcortex-proof-solution')?.trim() ?? '';
    const record = requestProofStore.get(proofId);
    requestProofStore.delete(proofId);

    if (!record || record.expiresAt <= Date.now()) {
      res.status(428).json({ error: 'Request proof is missing or expired' });
      return;
    }

    if (
      record.action !== action ||
      record.nonce !== nonce ||
      record.origin !== (req.get('origin')?.trim() ?? '') ||
      record.ip !== getRequestIp(req) ||
      record.sessionId !== req.sessionId
    ) {
      res.status(400).json({ error: 'Request proof validation failed' });
      return;
    }

    if (!verifyActionProof(proofId, nonce, solution, record.difficulty)) {
      res.status(400).json({ error: 'Request proof validation failed' });
      return;
    }

    next();
  };
}

function assertAnonymousApiSession(req, res, next) {
  const token = getCookie(req, SESSION_COOKIE_NAME);
  const payload = verifySessionToken(token);
  if (!payload) {
    res.setHeader('X-MockCortex-Bootstrap-Required', '1');
    res.status(401).json({ error: 'Missing or invalid API session' });
    return;
  }
  req.sessionId = payload.sid;
  req.sessionSecretHash = payload.shash;
  next();
}

app.use(addSecurityHeaders);
app.use(cors({ origin: corsOriginValidator, methods: ['GET', 'POST', 'OPTIONS'], credentials: true }));
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    config: {
      geminiConfigured: hasGeminiKey,
      elevenLabsConfigured: hasElevenLabsKey,
      brainServiceConfigured: hasBrainServiceConfig,
    },
  });
});

app.use('/api', requireAllowedOrigin);

const challengeLimiter = createRateLimiter({ windowMs: 60_000, max: 12, keySuffix: 'challenge' });
const bootstrapLimiter = createRateLimiter({ windowMs: 60_000, max: 6, keySuffix: 'bootstrap' });
const requestProofLimiter = createRateLimiter({ windowMs: 60_000, max: 40, keySuffix: 'request-proof' });
const defaultLimiter = createRateLimiter({ windowMs: 60_000, max: 20, keySuffix: 'default' });
const expensiveLimiter = createRateLimiter({ windowMs: 60_000, max: 6, keySuffix: 'expensive' });
const cloneLimiter = createRateLimiter({ windowMs: 10 * 60_000, max: 2, keySuffix: 'clone' });

app.get('/api/session/challenge', challengeLimiter, (req, res) => {
  pruneExpiredChallenges();
  const challengeId = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  challengeStore.set(challengeId, {
    nonce,
    expiresAt,
    origin: req.get('origin')?.trim() ?? '',
    ip: getRequestIp(req),
  });

  res.json({
    challengeId,
    nonce,
    difficulty: SESSION_POW_DIFFICULTY,
    expiresAt,
  });
});

app.post('/api/session/bootstrap', bootstrapLimiter, (req, res) => {
  pruneExpiredChallenges();

  const sessionId = sanitizeText(req.body?.sessionId ?? '', 64);
  const sessionSecret = sanitizeText(req.body?.sessionSecret ?? '', 64);
  const challengeId = sanitizeText(req.body?.challengeId ?? '', 64);
  const nonce = sanitizeText(req.body?.nonce ?? '', 64);
  const solution = sanitizeText(req.body?.solution ?? '', 32);

  if (!SESSION_ID_PATTERN.test(sessionId) || !SESSION_SECRET_PATTERN.test(sessionSecret)) {
    return res.status(400).json({ error: 'Invalid anonymous session credentials' });
  }

  const challenge = challengeStore.get(challengeId);
  challengeStore.delete(challengeId);

  if (!challenge || challenge.expiresAt <= Date.now()) {
    return res.status(400).json({ error: 'Challenge expired. Refresh and try again.' });
  }
  if (
    challenge.nonce !== nonce ||
    challenge.origin !== (req.get('origin')?.trim() ?? '') ||
    challenge.ip !== getRequestIp(req)
  ) {
    return res.status(400).json({ error: 'Challenge validation failed' });
  }
  if (!verifyProofOfWork(challengeId, nonce, solution)) {
    return res.status(400).json({ error: 'Proof-of-work validation failed' });
  }

  setSessionCookie(req, res, createSessionToken(sessionId, sessionSecret));
  res.status(204).end();
});

app.use('/api', assertAnonymousApiSession);

app.get('/api/request-proof', requestProofLimiter, (req, res) => {
  pruneExpiredRequestProofs();

  const action = sanitizeText(req.query.action ?? '', 64);
  const difficulty = REQUEST_PROOF_DIFFICULTIES[action];
  if (!difficulty) {
    return res.status(400).json({ error: 'Unsupported action proof request' });
  }

  const proofId = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + REQUEST_PROOF_TTL_MS;
  requestProofStore.set(proofId, {
    action,
    nonce,
    expiresAt,
    origin: req.get('origin')?.trim() ?? '',
    ip: getRequestIp(req),
    sessionId: req.sessionId,
    difficulty,
  });

  res.json({
    proofId,
    nonce,
    difficulty,
    expiresAt,
  });
});

app.post('/api/ask-question', defaultLimiter, requireRequestProof('ask-question'), async (req, res) => {
  if (!elevenlabs) {
    return res.status(503).json({ error: 'Server misconfigured: ELEVENLABS_API_KEY is missing' });
  }

  try {
    const question = sanitizeText(req.body?.question ?? '', 500);
    const voiceId = parseVoiceId(req.body?.voiceId);
    if (!question) {
      return res.status(400).json({ error: 'question is required' });
    }

    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text: question,
      modelId: 'eleven_turbo_v2_5',
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    for await (const chunk of audio) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error('ElevenLabs Error:', error);
    res.status(500).send('Audio failed');
  }
});

app.post('/api/parse-resume', expensiveLimiter, requireRequestProof('parse-resume'), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing' });
  }

  const fileBase64 = req.body?.fileBase64;
  const mimeType = sanitizeText(req.body?.mimeType || 'application/pdf', 64).toLowerCase();
  if (!fileBase64 || mimeType !== 'application/pdf') {
    return res.status(400).json({ error: 'A PDF resume is required' });
  }
  if (estimateBase64Bytes(fileBase64) > MAX_RESUME_BYTES) {
    return res.status(413).json({ error: 'Resume exceeds the 10 MB limit' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = 'Extract structured information from this resume. Return ONLY JSON: {"name":"full name or empty string","skills":["up to 10 key skills"],"experience":"2-3 sentence summary of work experience","education":"highest degree and field, or empty string","highlights":["up to 3 notable achievements or projects"]}';
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType, data: fileBase64 } },
    ]);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);
    res.json(sanitizeResumeSummary(parsed));
  } catch (error) {
    console.error('Resume Parse Error:', error);
    res.status(500).json({ error: 'Failed to parse resume' });
  }
});

app.post('/api/generate-questions', expensiveLimiter, requireRequestProof('generate-questions'), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing' });
  }

  const jobDescription = sanitizeText(req.body?.jobDescription ?? '');
  if (jobDescription.length < 20) {
    return res.status(400).json({ error: 'jobDescription must be at least 20 characters' });
  }

  const resumeSummary = sanitizeResumeSummary(req.body?.resumeSummary);
  const resumeContext = resumeSummary
    ? `\nCandidate resume summary: skills: ${resumeSummary.skills.join(', ') || 'unknown'}. Experience: ${resumeSummary.experience || 'unknown'}. Education: ${resumeSummary.education || 'unknown'}. Highlights: ${resumeSummary.highlights.join('; ') || 'none'}.`
    : '';

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are a calm, professional interview coach conducting a realistic job interview.${resumeContext}

Job description: ${jobDescription}

Generate exactly 5 interview questions following this realistic interview structure:
1. Intro: A warm "tell me about yourself" style opener (type: "intro")
2. Resume: A specific question referencing the candidate's actual background${resumeSummary ? ' from their resume' : ''} (type: "resume")
3. Behavioral: A STAR-format behavioral question relevant to the role (type: "behavioral")
4. Technical: A technical or skills-based question for the role (type: "technical")
5. Situational: A "what would you do if..." scenario question (type: "situational")

Keep language professional, concise, and supportive. Return ONLY JSON: [{"question":"text","type":"intro|resume|behavioral|technical|situational"}]`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const questions = JSON.parse(text);
    if (!Array.isArray(questions) || questions.length !== 5) {
      throw new Error('Unexpected question count returned from model');
    }
    res.json({
      questions: questions.map((item) => ({
        question: sanitizeText(item?.question ?? '', 400),
        type: sanitizeText(item?.type ?? '', 40),
      })),
    });
  } catch (error) {
    console.error('Question Gen Error:', error);
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

app.post('/api/get-feedback', expensiveLimiter, requireRequestProof('get-feedback'), async (req, res) => {
  if (!genAI) {
    return res.status(503).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing' });
  }

  try {
    const sessionData = parseSessionData(req.body?.sessionData);
    const resumeSummary = sanitizeResumeSummary(req.body?.resumeSummary);
    const resumeContext = resumeSummary
      ? ` The candidate's resume shows: ${resumeSummary.experience || ''}. Skills: ${resumeSummary.skills.join(', ') || ''}.`
      : '';
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are a calm, professional interview coach.${resumeContext} Review these interview answers: ${JSON.stringify(sessionData)}. Score each answer 0-10. Be constructive and encouraging while still specific. A decent answer with correct intent should score at least 6. Reserve scores below 4 for clearly incorrect or empty answers. If a resume was provided, note whether the answer aligns with stated experience. Return ONLY JSON: [{"score":number,"critique":"text"}]`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const feedback = JSON.parse(text);
    if (!Array.isArray(feedback)) {
      throw new Error('Invalid feedback payload');
    }
    res.json({
      feedback: feedback.slice(0, sessionData.length).map((item) => ({
        score: Number.isFinite(item?.score) ? Math.max(0, Math.min(10, Math.round(item.score))) : 0,
        critique: sanitizeText(item?.critique ?? '', 1_200),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('sessionData')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Feedback Error:', error);
    res.status(500).json({ error: 'Feedback failed' });
  }
});

app.post('/api/neural-engagement', expensiveLimiter, requireRequestProof('neural-engagement'), async (req, res) => {
  if (!hasBrainServiceConfig) {
    return res.json({ available: false, pending: true, results: null });
  }

  let transcripts;
  try {
    transcripts = parseTranscripts(req.body?.transcripts);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  try {
    const results = await Promise.all(
      transcripts.map(async (text) => {
        const response = await fetch(`${process.env.BRAIN_SERVICE_URL}/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Brain-Service-Api-Key': process.env.BRAIN_SERVICE_API_KEY,
          },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) throw new Error(`Brain service error: ${response.status}`);
        return response.json();
      })
    );

    let interpretation = '';
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const prompt = `Summarize this neural engagement analysis in plain English for a job candidate in 3-4 short sentences. Include one strength and one concrete improvement tip. Data: ${JSON.stringify(results)}`;
        const summary = await model.generateContent(prompt);
        interpretation = sanitizeText(summary.response.text(), 800);
      } catch {
        interpretation = '';
      }
    }

    res.json({
      available: true,
      pending: false,
      results,
      interpretation,
    });
  } catch (error) {
    console.error('Neural Engagement Error:', error);
    res.json({ available: false, pending: true, results: null });
  }
});

app.post('/api/clone-voice', cloneLimiter, requireRequestProof('clone-voice'), async (req, res) => {
  if (!elevenlabs) {
    return res.status(503).json({ error: 'Server misconfigured: ELEVENLABS_API_KEY is missing' });
  }

  try {
    const mimeType = parseClonePayload(req.body?.audioBase64, req.body?.mimeType);
    const buffer = Buffer.from(req.body.audioBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType });
    const result = await elevenlabs.voices.ivc.create({
      name: `MockCortex - ${sanitizeText(req.body?.interviewerName || 'Custom Voice', 80)}`,
      files: [blob],
      removeBackgroundNoise: true,
    });
    res.json({ voiceId: result.voiceId });
  } catch (error) {
    if (error instanceof Error) {
      if (/exceeds the 8 MB limit/.test(error.message)) {
        return res.status(413).json({ error: error.message });
      }
      if (/Audio sample|Unsupported audio format/.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
    }
    console.error('Voice Clone Error:', error);
    res.status(500).json({ error: 'Voice cloning failed' });
  }
});

app.post('/api/clone-voice-youtube', cloneLimiter, requireRequestProof('clone-voice-youtube'), async (req, res) => {
  if (!elevenlabs) {
    return res.status(503).json({ error: 'Server misconfigured: ELEVENLABS_API_KEY is missing' });
  }

  let youtubeUrl;
  try {
    youtubeUrl = parseYouTubeUrl(req.body?.youtubeUrl);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const tmp = tmpdir();
  const stamp = `mockcortex-yt-${Date.now()}`;
  const base = join(tmp, stamp);

  try {
    const { default: ytDlp } = await import('yt-dlp-exec');
    await ytDlp(youtubeUrl, {
      output: `${base}.%(ext)s`,
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '5',
      downloadSections: '*0-90',
      noPlaylist: true,
    });

    const files = await readdir(tmp);
    const audioFile = files.find((fileName) => fileName.startsWith(stamp) && fileName.endsWith('.mp3'));
    if (!audioFile) throw new Error('Audio file not found after download');
    const audioPath = join(tmp, audioFile);
    const audioBuffer = await readFile(audioPath);
    await unlink(audioPath).catch(() => {});

    if (audioBuffer.byteLength > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: 'Extracted audio exceeds the 8 MB limit' });
    }

    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const result = await elevenlabs.voices.ivc.create({
      name: `MockCortex - ${sanitizeText(req.body?.interviewerName || 'Custom Voice', 80)}`,
      files: [blob],
      removeBackgroundNoise: true,
    });

    res.json({ voiceId: result.voiceId });
  } catch (error) {
    console.error('YouTube Voice Clone Error:', error);
    readdir(tmp)
      .then((files) => files
        .filter((fileName) => fileName.startsWith(stamp))
        .forEach((fileName) => unlink(join(tmp, fileName)).catch(() => {})))
      .catch(() => {});
    res.status(500).json({ error: 'Failed to extract audio from YouTube. Make sure the video is public and has clear speech.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
