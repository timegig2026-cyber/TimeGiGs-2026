import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. DoS Protection: Enforce strict body size limits for JSON streams
  app.use(express.json({ limit: '10kb' }));

  // Gemini API Proxy
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, model: requestedModel } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: 'GEMINI_API_KEY is not configured.',
          code: 'CONFIG_ERROR'
        });
      }

      if (!prompt) {
        return res.status(400).json({ 
          error: 'Prompt is required.',
          code: 'INVALID_REQUEST'
        });
      }

      // Initialize official SDK client
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      
      // 2. Fix Hardcoded Model Logic Gap: Default to flash, but allow dynamic override
      const modelName = requestedModel || 'gemini-1.5-flash';
      const model = genAI.getGenerativeModel({ model: modelName });

      // Execute call
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      // 3. Extract text asynchronously via correct response parsing
      const text = response.text();

      res.json({ text });
    } catch (error: any) {
      // 4. Eradicate Error Message Opacity: Surface semantic failures
      console.error('Gemini API Error:', error);
      
      const errorMessage = error.message || 'An unknown error occurred';
      const errorStatus = error.status || 500;
      const errorStr = errorMessage.toLowerCase();
      
      // Safety Filter Block
      if (errorStr.includes('safety') || errorStr.includes('finish_reason_safety')) {
        return res.status(400).json({ 
          error: 'Content blocked by safety filters.',
          details: errorMessage,
          code: 'SAFETY_BLOCK'
        });
      }
      
      // Quota / Rate Limit
      if (errorStr.includes('quota') || errorStr.includes('exhausted') || errorStatus === 429) {
        return res.status(429).json({ 
          error: 'API quota exhausted or rate limit reached.',
          details: errorMessage,
          code: 'QUOTA_EXCEEDED'
        });
      }

      // Invalid Credentials
      if (errorStr.includes('api_key') || errorStr.includes('invalid_key') || errorStatus === 401) {
        return res.status(401).json({ 
          error: 'Invalid API configuration.',
          details: errorMessage,
          code: 'INVALID_AUTH'
        });
      }

      // Fallback
      res.status(errorStatus).json({ 
        error: 'Failed to generate content',
        details: errorMessage,
        code: 'GENERATE_FAILED'
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
