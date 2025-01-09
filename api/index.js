import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import rateLimit from 'express-rate-limit';

// Load environment variables
dotenv.config();

// Debug environment variables
console.log('Environment variables loaded');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY prefix:', process.env.OPENAI_API_KEY?.substring(0, 7));
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length);

const app = express();

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

// Initialize OpenAI with configuration
console.log('Initializing OpenAI client...');

let openai;
try {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    const apiKey = process.env.OPENAI_API_KEY.trim();
    console.log('Using API key with prefix:', apiKey.substring(0, 8));

    openai = new OpenAI({
        apiKey,
        baseURL: 'https://api.openai.com/v1', // Explicitly set the base URL
        defaultHeaders: {
            'Authorization': `Bearer ${apiKey}`,
            'OpenAI-Organization': process.env.OPENAI_ORG_ID // Optional: if you have an org ID
        },
        defaultQuery: {},
        maxRetries: 3,
        timeout: 30000
    });

    // Test the OpenAI client with a simpler API call
    console.log('Testing OpenAI client configuration...');
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo", // Use a simpler model for testing
        messages: [
            { role: "user", content: "Hello" }
        ],
        max_tokens: 5
    });
    
    console.log('OpenAI client test successful:', response.choices[0]?.message?.content);
} catch (error) {
    console.error('Error initializing OpenAI client:', {
        name: error.name,
        message: error.message,
        type: error.type,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
    });
    process.exit(1);
}

// Rate limiting setup
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

// Apply rate limiting to all requests
app.use(limiter);

app.post('/api/chat', validateInput, async (req, res) => {
    try {
        const userMessage = req.body.message.trim();
        console.log('Received message:', userMessage);

        if (!openai) {
            throw new Error('OpenAI client is not initialized');
        }

        console.log('Creating chat completion...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ],
            temperature: 0.7,
            max_tokens: 1000,
            presence_penalty: 0.6,
            frequency_penalty: 0.6
        });

        console.log('Chat completion received');
        
        if (!completion.choices || !completion.choices[0]?.message?.content) {
            console.error('Invalid response structure:', completion);
            throw new Error('Invalid response from OpenAI');
        }

        const response = completion.choices[0].message.content;
        console.log('Sending response to client');
        
        res.json({ 
            response,
            usage: completion.usage
        });
    } catch (error) {
        console.error('Chat API Error:', {
            name: error.name,
            message: error.message,
            type: error.type,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data
        });
        
        let errorMessage = 'An error occurred while processing your request.';
        let statusCode = 500;

        if (error.response?.status === 401) {
            errorMessage = 'API key authentication failed. Please check your OpenAI API key.';
            statusCode = 401;
        } else if (error.response?.status === 429) {
            errorMessage = 'Too many requests. Please try again later.';
            statusCode = 429;
        } else if (error.message.includes('API key')) {
            errorMessage = 'OpenAI API key is not configured properly.';
            statusCode = 500;
        }
        
        res.status(statusCode).json({ 
            error: errorMessage,
            type: error.type || 'SERVER_ERROR',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Use port provided by Vercel or default to 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
});
