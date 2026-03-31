import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFile, unlink, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

dotenv.config();

const app = express();

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
const hasElevenLabsKey = Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY.trim());

app.use(cors({
  origin: [
    'http://localhost:5173',
    /\.vercel\.app$/,
    /\.onrender\.com$/,
  ],
}));
app.use(express.json({ limit: '25mb' }));

const genAI = hasGeminiKey ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const elevenlabs = hasElevenLabsKey ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY }) : null;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    config: {
      geminiConfigured: hasGeminiKey,
      elevenLabsConfigured: hasElevenLabsKey,
      brainServiceConfigured: Boolean(process.env.BRAIN_SERVICE_URL),
    },
  });
});

// --- ROUTE: Text to Speech ---
app.post('/api/ask-question', async (req, res) => {
  const { question, voiceId } = req.body;
  if (!elevenlabs) {
    return res.status(503).json({ error: 'Server misconfigured: ELEVENLABS_API_KEY is missing' });
  }
  try {
    const audio = await elevenlabs.textToSpeech.convert(voiceId || 'JBFqnCBsd6RMkjVDRZzb', {
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

// --- ROUTE: Parse Resume ---
app.post('/api/parse-resume', async (req, res) => {
  const { fileBase64, mimeType } = req.body;
  if (!genAI) {
    return res.status(503).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing' });
  }
  if (!fileBase64) return res.status(400).json({ error: 'No file provided' });
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `Extract structured information from this resume. Return ONLY JSON: {"name":"full name or empty string","skills":["up to 10 key skills"],"experience":"2-3 sentence summary of work experience","education":"highest degree and field, or empty string","highlights":["up to 3 notable achievements or projects"]}`;
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: mimeType || 'application/pdf', data: fileBase64 } },
    ]);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'Failed to parse resume' });
    }
    res.json(parsed);
  } catch (error) {
    console.error('Resume Parse Error:', error);
    res.status(500).json({ error: 'Failed to parse resume' });
  }
});

// --- ROUTE: Generate Questions ---
app.post('/api/generate-questions', async (req, res) => {
  const { jobDescription, resumeSummary } = req.body;
  if (!genAI) {
    return res.status(503).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing' });
  }
  if (!jobDescription || String(jobDescription).trim().length < 20) {
    return res.status(400).json({ error: 'jobDescription must be at least 20 characters' });
  }
  const resumeContext = resumeSummary
    ? `\nCandidate resume summary: skills: ${resumeSummary.skills?.join(', ') || 'unknown'}. Experience: ${resumeSummary.experience || 'unknown'}. Education: ${resumeSummary.education || 'unknown'}. Highlights: ${resumeSummary.highlights?.join('; ') || 'none'}.`
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
    let questions;
    try {
      questions = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'Failed to parse questions from AI response' });
    }
    res.json({ questions });
  } catch (error) {
    console.error('Question Gen Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown Gemini error';
    res.status(500).json({ error: `Failed to generate questions: ${message}` });
  }
});

// --- ROUTE: Get Feedback ---
app.post('/api/get-feedback', async (req, res) => {
  const { sessionData, resumeSummary } = req.body;
  if (!genAI) {
    return res.status(503).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing' });
  }
  const resumeContext = resumeSummary
    ? ` The candidate's resume shows: ${resumeSummary.experience || ''}. Skills: ${resumeSummary.skills?.join(', ') || ''}.`
    : '';
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are a calm, professional interview coach.${resumeContext} Review these interview answers: ${JSON.stringify(sessionData)}. Score each answer 0-10. Be constructive and encouraging while still specific. A decent answer with correct intent should score at least 6. Reserve scores below 4 for clearly incorrect or empty answers. If a resume was provided, note whether the answer aligns with stated experience. Return ONLY JSON: [{"score":number,"critique":"text"}]`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    let feedback;
    try {
      feedback = JSON.parse(text);
    } catch {
      return res.status(500).json({ error: 'Failed to parse feedback from AI response' });
    }
    res.json({ feedback });
  } catch (error) {
    console.error('Feedback Error:', error);
    res.status(500).json({ error: 'Feedback failed' });
  }
});

// --- ROUTE: Neural Engagement (proxies to TRIBE v2 brain service) ---
app.post('/api/neural-engagement', async (req, res) => {
  const brainServiceUrl = process.env.BRAIN_SERVICE_URL;
  if (!brainServiceUrl) {
    return res.json({ available: false, pending: true, results: null });
  }

  const { transcripts } = req.body; // string[]
  if (!Array.isArray(transcripts) || transcripts.length === 0) {
    return res.status(400).json({ error: 'transcripts must be a non-empty array' });
  }

  try {
    const results = await Promise.all(
      transcripts.map(async (text) => {
        const r = await fetch(`${brainServiceUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(120_000), // 2 min per answer
        });
        if (!r.ok) throw new Error(`Brain service error: ${r.status}`);
        return r.json();
      })
    );

    let interpretation = '';
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = `Summarize this neural engagement analysis in plain English for a job candidate in 3-4 short sentences. Include one strength and one concrete improvement tip. Data: ${JSON.stringify(results)}`;
      const summary = await model.generateContent(prompt);
      interpretation = summary.response.text().trim();
    } catch {
      interpretation = '';
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

// --- ROUTE: Clone Voice (Instant Voice Cloning) ---
app.post('/api/clone-voice', async (req, res) => {
  const { audioBase64, mimeType, interviewerName } = req.body;
  if (!elevenlabs) {
    return res.status(503).json({ error: 'Server misconfigured: ELEVENLABS_API_KEY is missing' });
  }
  try {
    const buffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType || 'audio/mpeg' });
    const result = await elevenlabs.voices.ivc.create({
      name: `MockCortex - ${interviewerName || 'Custom Voice'}`,
      files: [blob],
      removeBackgroundNoise: true,
    });
    res.json({ voiceId: result.voiceId });
  } catch (error) {
    console.error('Voice Clone Error:', error);
    res.status(500).json({ error: 'Voice cloning failed' });
  }
});

// --- ROUTE: Clone Voice from YouTube URL ---
app.post('/api/clone-voice-youtube', async (req, res) => {
  const { youtubeUrl, interviewerName } = req.body;
  if (!elevenlabs) {
    return res.status(503).json({ error: 'Server misconfigured: ELEVENLABS_API_KEY is missing' });
  }

  // Validate YouTube URL
  if (!youtubeUrl || !/^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/)/.test(youtubeUrl)) {
    return res.status(400).json({ error: 'Please provide a valid YouTube URL.' });
  }

  const tmp = tmpdir();
  const base = join(tmp, `mockcortex-yt-${Date.now()}`);

  try {
    const { default: ytDlp } = await import('yt-dlp-exec');
    // Download first 90 seconds of audio as MP3 via yt-dlp + ffmpeg
    await ytDlp(youtubeUrl, {
      output: `${base}.%(ext)s`,
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '5',           // medium quality — enough for voice cloning
      downloadSections: '*0-90',   // first 90 seconds only
      noPlaylist: true,
      noCheckCertificates: true,
    });

    // Find the downloaded file — yt-dlp replaces %(ext)s with the actual extension
    const stamp = base.split('/').at(-1);
    const files = await readdir(tmp);
    const audioFile = files.find((f) => f.startsWith(stamp ?? '') && f.endsWith('.mp3'));
    if (!audioFile) throw new Error('Audio file not found after download');
    const audioPath = join(tmp, audioFile);
    const audioBuffer = await readFile(audioPath);
    await unlink(audioPath).catch(() => {});

    const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const result = await elevenlabs.voices.ivc.create({
      name: `MockCortex - ${interviewerName || 'Custom Voice'}`,
      files: [blob],
      removeBackgroundNoise: true,
    });

    res.json({ voiceId: result.voiceId });
  } catch (error) {
    console.error('YouTube Voice Clone Error:', error);
    // Clean up any leftover temp files
    readdir(tmp)
      .then((files) => files
        .filter((f) => f.startsWith('mockcortex-yt-'))
        .forEach((f) => unlink(join(tmp, f)).catch(() => {})))
      .catch(() => {});
    res.status(500).json({ error: 'Failed to extract audio from YouTube. Make sure the video is public and has clear speech.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend: http://localhost:${PORT}`));
