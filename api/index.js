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
const systemMessage = `You are an AI assistant providing information about Prophet Muhammad ﷺ and Islamic teachings. Your responses must follow these strict requirements:

1. Sources requirement (Quran, Hadith, Sira, Tafsir)
2. Proper honorifics and respectful language
3. Citation requirements:
   - Original Arabic text for ALL Quranic verses and hadith
   - Proper Arabic typography and Unicode
   - Correct harakat (diacritical marks)

4. Clear boundaries about not issuing fatwas
5. Encouragement to verify with scholars
6. Islamic etiquette in responses

Format your response as follows:
1. Start with "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ"
2. Relevant Quranic verses and hadith with proper citations
3. Arabic text alongside English translations
4. Appropriate honorifics
5. A reminder to verify with scholars

Structured Formatting:
- Arabic text first
- Transliteration (when helpful)
- English translation
- Source citation

Better Organization:
- Using markdown for formatting
- Clear sections with proper spacing
- Consistent presentation format

Enhanced Opening/Closing:
- Arabic Bismillah (بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ)
- Closing phrases in both Arabic and English

Remember: Base all responses on authentic sources only. Direct complex questions to qualified scholars. Maintain appropriate Islamic etiquette at all times.`;

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
    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        // Initialize OpenAI for each request
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 2,
            timeout: 60000 // 60 second timeout
        });

        const { message } = req.body;

        // Send initial response to keep connection alive
        res.write('data: {"status": "processing"}\n\n');

        // Create the completion with streaming
        const stream = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                { role: "system", content: systemMessage },
                { role: "user", content: message }
            ],
            temperature: 0.7,
            max_tokens: 800,
            stream: true // Enable streaming
        });

        let fullResponse = '';

        // Process the stream
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                fullResponse += content;
                // Send each chunk to keep connection alive
                res.write(`data: {"chunk": ${JSON.stringify(content)}}\n\n`);
            }
        }

        // Process and send the final response
        const processedResponse = processMessageText(fullResponse);
        res.write(`data: {"response": ${JSON.stringify(processedResponse)}, "status": "complete"}\n\n`);
        res.end();

    } catch (error) {
        console.error('Error in chat endpoint:', error);
        
        // Handle specific error types
        if (error.message?.includes('timed out') || error.code === 'ETIMEDOUT') {
            res.write(`data: {"error": "Request timed out", "message": "The request took too long to complete. Please try again."}\n\n`);
        } else if (error.status === 429 || error.code === 'rate_limit_exceeded') {
            res.write(`data: {"error": "Rate limit exceeded", "message": "Too many requests. Please wait a moment and try again."}\n\n`);
        } else {
            res.write(`data: {"error": "An error occurred", "message": "${error.message || 'Internal server error'}"}\n\n`);
        }
        res.end();
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
