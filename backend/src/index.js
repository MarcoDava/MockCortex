import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    /\.vercel\.app$/,
    /\.onrender\.com$/,
  ],
}));
app.use(express.json({ limit: '10mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

const PERSONAS = {
  'JBFqnCBsd6RMkjVDRZzb': "Skibidi Toilet (Brainrot king, uses gyatt/rizz/sigma, chaotic genius coach)",
  'ErXwobaYiN019PkySvjV': "Donald Trump (Confident, uses 'huge'/'tremendous', focuses on winning)",
  'EXAVITQu4vr4xnSDxMaL': "Tung Tung Sahur (High energy, drumming sounds like 'Tung Tung', sincere but loud)",
};

// --- ROUTE: Text to Speech ---
app.post('/api/ask-question', async (req, res) => {
  const { question, voiceId } = req.body;
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

// --- ROUTE: Generate Questions ---
app.post('/api/generate-questions', async (req, res) => {
  const { jobDescription, voiceId } = req.body;
  const persona = PERSONAS[voiceId] || 'a professional interviewer';
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `You are ${persona}. Generate exactly 3 interview questions (mix behavioral and technical) for this job: ${jobDescription}. Speak in character. Return ONLY JSON: [{"question":"text","type":"behavioral|technical"}]`;
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
    res.status(500).json({ error: 'Failed to generate questions' });
  }
});

// --- ROUTE: Analyze Emotion from Webcam Frame ---
app.post('/api/analyze-emotion', async (req, res) => {
  const { imageBase64, voiceId } = req.body;
  const persona = PERSONAS[voiceId] || 'a professional interviewer';
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    const prompt = `You are ${persona} watching a job interview candidate via webcam. Analyze their facial expression. Return ONLY JSON: {"emotion":"one word","shouldInterrupt":true|false,"message":"if shouldInterrupt, a brief in-character comment under 20 words, else empty string"}. Set shouldInterrupt to true only if they look clearly distressed, panicked, confused, or blank. Be lenient.`;
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: imageBase64,
        },
      },
    ]);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.json({ emotion: 'neutral', shouldInterrupt: false, message: '' });
    }
    res.json(parsed);
  } catch (error) {
    console.error('Emotion Analysis Error:', error);
    // Non-fatal: return neutral so interview continues
    res.json({ emotion: 'neutral', shouldInterrupt: false, message: '' });
  }
});

// --- ROUTE: Get Feedback ---
app.post('/api/get-feedback', async (req, res) => {
  const { sessionData, voiceId } = req.body;
  const persona = PERSONAS[voiceId] || 'a professional interviewer';
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = `You are ${persona}. Review these interview answers: ${JSON.stringify(sessionData)}. Score each answer 0-10. Be encouraging and generous — a decent answer with correct intent scores at least 6. Reserve scores below 4 only for completely wrong or empty answers. Speak in character. Return ONLY JSON: [{"score":number,"critique":"text"}]`;
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend: http://localhost:${PORT}`));
