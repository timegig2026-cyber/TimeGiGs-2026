import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enforce body size limit for DoS protection
  app.use(express.json({ limit: '10kb' }));

  // Gemini API Proxy
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
      }

      // Instantiate official SDK client
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      
      // Target production model container
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
      });

      // Execute and await response
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      // Extract text asynchronously
      const text = response.text();

      res.json({ text });
    } catch (error) {
      console.error('Gemini API Error:', error);
      res.status(500).json({ error: 'Failed to generate content' });
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
