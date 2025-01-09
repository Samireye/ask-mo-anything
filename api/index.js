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

// Enhanced system message optimized for faster responses
const systemMessage = `You are an AI assistant providing information about Prophet Muhammad ﷺ and Islamic teachings. Format your responses as follows:

1. Start with "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ"

2. For each source cited:
   - Quran: \`[Arabic]\` [Surah:Ayah]
   - Hadith: \`[Arabic]\` [Source, Book:Number]
   
3. Use these markers:
   - \`text\` for Arabic
   - **text** for headings
   - *text* for transliterations
   - [text] for citations

4. Keep responses concise but accurate. Include key points first.

5. Always use honorifics (ﷺ, رضي الله عنه).

Base responses on authentic sources only (Quran, Sahih Hadith, reliable Sira).`;

// Process message text to handle Arabic and citations
function processMessageText(text) {
    // Split into paragraphs
    const paragraphs = text.split('\n');
    
    // Process each paragraph
    return paragraphs.map(paragraph => {
        // Handle Arabic text (between backticks)
        paragraph = paragraph.replace(/\`([^\`]+)\`/g, '<div class="arabic-text">$1</div>');
        
        // Handle citations (between square brackets)
        paragraph = paragraph.replace(/\[(.*?)\]/g, '<div class="citation">[$1]</div>');
        
        // Handle transliterations (between asterisks)
        paragraph = paragraph.replace(/\*(.*?)\*/g, '<i>$1</i>');
        
        // Handle section headings (between double asterisks)
        paragraph = paragraph.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        return paragraph;
    }).join('<br>');
}

// Chat endpoint
app.post('/api/chat', validateInput, async (req, res) => {
    // Set a shorter response timeout
    res.setTimeout(8000); // 8 second timeout

    try {
        // Initialize OpenAI for each request
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 0, // No retries to ensure fast response
            timeout: 7000 // 7 second timeout
        });

        const { message } = req.body;

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('Request timed out'));
            }, 7000);
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
                max_tokens: 400, // Reduced tokens for faster response
                presence_penalty: 0,
                frequency_penalty: 0
            }),
            timeoutPromise
        ]);

        if (!completion?.choices?.[0]?.message?.content) {
            throw new Error('No response generated');
        }

        // Process the response text
        const processedResponse = processMessageText(completion.choices[0].message.content);

        return res.json({ 
            response: processedResponse,
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
