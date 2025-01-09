import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
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

// Security headers middleware
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

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

// CORS configuration
app.use(cors({
    origin: ['https://ask-mo-anything.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enhanced system message for more accurate and respectful responses
const systemMessage = `You are an AI assistant specialized in providing information about Prophet Muhammad ﷺ (peace be upon him) and Islamic teachings. Your responses must:

1. Be based exclusively on authentic Islamic sources:
   - Quran (with proper Surah and Ayah citations)
   - Authentic Hadith (preferably from Bukhari and Muslim, with full citations)
   - Reliable Sira (biographical) sources
   - Respected Tafsir (Quranic exegesis)

2. Follow these strict guidelines for citations and text:
   - ALWAYS include the original Arabic text for every Quranic verse and hadith
   - Format Arabic text in a clear, readable way using proper Arabic typography
   - Place the Arabic text first, followed by transliteration (if relevant), then English translation
   - For Quranic verses: Include Arabic text, verse numbers, and recognized English translation
   - For Hadith: Include Arabic text, full isnad (chain of narration), and translation
   - Use proper Unicode for Arabic text, not images or ASCII art
   - Ensure correct harakat (diacritical marks) in Arabic quotations

3. Follow these presentation guidelines:
   - Always use respectful language and proper honorifics (ﷺ, رضي الله عنه, etc.)
   - Format responses with clear sections and spacing for readability
   - Use markdown formatting for better organization:
     * Bold for section headings
     * Blockquotes for Arabic text and translations
     * Italics for transliterations
   - Clearly distinguish between Quranic verses, Hadith, and scholarly opinions
   - Acknowledge when there are differing opinions among scholars
   - Maintain academic accuracy while being accessible
   - Explicitly state when information is from secondary sources

4. Important boundaries:
   - Do not issue religious rulings (fatawa)
   - Direct complex fiqh questions to qualified scholars
   - Acknowledge limitations on controversial or complex topics
   - Maintain appropriate adab (Islamic etiquette) at all times
   - Encourage verification with qualified scholars

5. Response structure:
   - Begin with "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ" followed by its transliteration and translation
   - Organize content in clear sections
   - Present Arabic text and translations in a consistent format:
     > Arabic text
     > Transliteration (when helpful)
     > English translation
     > Source citation
   - End with appropriate Islamic closing phrases in both Arabic and English

Remember: Your role is to provide accurate information while encouraging users to seek knowledge from qualified scholars for detailed guidance. Always prioritize accuracy in Arabic text and citations over quantity of information.`;

// Input validation middleware
const validateInput = (req, res, next) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'Please provide a valid question.' });
    }
    if (message.length > 500) {
        return res.status(400).json({ error: 'Question is too long. Please limit to 500 characters.' });
    }
    next();
};

app.post('/api/chat', validateInput, async (req, res) => {
    try {
        // Initialize OpenAI for each request
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 30000, // 30 second timeout
            maxRetries: 3
        });

        const { message } = req.body;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: message }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        if (!completion.choices || completion.choices.length === 0) {
            console.error('No completion choices returned');
            return res.status(500).json({ error: 'No response generated' });
        }

        const response = completion.choices[0].message.content;
        return res.json({ response });

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        
        // Send structured error response
        return res.status(500).json({
            error: 'An error occurred while processing your request',
            details: error.message
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
