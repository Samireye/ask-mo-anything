import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
}

const app = express();

// Trust proxy - required for rate limiting on Vercel
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
    origin: ['https://ask-mo-anything.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rate limiting setup
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true
});

// Apply rate limiting to all routes
app.use(limiter);

// Input validation middleware
const validateInput = (req, res, next) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid input. Message is required.' });
    }
    next();
};

// Enhanced system message for more accurate and respectful responses
const systemMessage = `You are an AI assistant specialized in providing information about Prophet Muhammad ﷺ (peace be upon him) and Islamic teachings. Your responses must:

1. Be based exclusively on authentic Islamic sources:
   - Quran (with proper Surah and Ayah citations)
   - Authentic Hadith (preferably from Bukhari and Muslim, with full citations)
   - Reliable Sira (biographical) sources
   - Respected Tafsir (Quranic exegesis)

2. Include proper Arabic text where relevant, followed by transliteration and translation.

3. Be respectful and use appropriate honorifics (ﷺ for Prophet Muhammad, رضي الله عنه/عنها for companions).

4. Encourage verification with qualified scholars for complex matters.

5. Acknowledge when a topic requires more scholarly expertise.

6. Provide clear citations for all information.`;

// Chat endpoint
app.post('/api/chat', validateInput, async (req, res) => {
    // Set a shorter response timeout to avoid API Gateway timeout
    res.setTimeout(30000); // 30 second timeout

    try {
        // Initialize OpenAI for each request
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 1, // Reduce retries to respond faster
            timeout: 25000 // 25 second timeout
        });

        const { message } = req.body;

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Request timed out'));
            }, 25000);
        });

        // Race between the OpenAI request and timeout
        const completion = await Promise.race([
            openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: message }
                ],
                temperature: 0.7,
                max_tokens: 500, // Reduced tokens for faster response
                presence_penalty: 0,
                frequency_penalty: 0
            }),
            timeoutPromise
        ]);

        if (!completion?.choices?.[0]?.message?.content) {
            throw new Error('No response generated');
        }

        return res.json({ 
            response: completion.choices[0].message.content,
            status: 'success'
        });

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        
        // Handle specific error types
        if (error.message?.includes('timed out') || error.code === 'ETIMEDOUT') {
            return res.status(504).json({
                error: 'Request timed out',
                message: 'The request took too long to complete. Please try again.'
            });
        }

        if (error.status === 429 || error.code === 'rate_limit_exceeded') {
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: 'Too many requests. Please wait a moment and try again.'
            });
        }

        return res.status(error.status || 500).json({
            error: 'An error occurred',
            message: error.message || 'Internal server error',
            status: 'error'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).json({
        error: 'An unexpected error occurred',
        details: err.message
    });
});

// Export the app for serverless deployment
export default app;
