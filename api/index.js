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
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (data) => {
        try {
            const event = `data: ${JSON.stringify(data)}\n\n`;
            res.write(event);
        } catch (error) {
            console.error('Error sending event:', error);
        }
    };

    let streamEnded = false;
    const endStream = () => {
        if (!streamEnded) {
            streamEnded = true;
            try {
                res.end();
            } catch (error) {
                console.error('Error ending stream:', error);
            }
        }
    };

    try {
        console.log('Starting chat request processing');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            maxRetries: 1
        });

        const { message } = req.body;
        console.log('Received message:', message);

        // Split the system message into parts and add completion marker
        const systemMessages = [
            {
                role: "system",
                content: `You are an AI assistant providing comprehensive information about Prophet Muhammad ﷺ and Islamic teachings.

Your response must follow this exact format:

بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ

[INTRODUCTION]
- Brief overview of the topic
- Historical or contextual background
- Key concepts or terms explained

[QURAN]
Include at least two relevant verses:
For each verse:
- Surah name and number:verse
- Complete Arabic text
- Word-by-word translation if relevant
- Full English translation
- Brief tafsir or explanation

[HADITH]
Include at least two relevant hadith:
For each hadith:
- Complete narrator chain
- Source (e.g., Bukhari, Muslim)
- Complete Arabic text
- English translation
- Brief explanation of context/meaning

[SCHOLARLY OPINIONS]
- Views from major schools of thought
- Key scholarly interpretations
- Contemporary relevance

[PRACTICAL GUIDANCE]
- How this applies today
- Common misconceptions addressed
- Practical implementation tips

[CONCLUSION]
- Summary of main points
- Importance of seeking knowledge
- Reminder to verify with scholars
- واللهُ أَعْلَم

[RELATED TOPICS]
List 3-4 related questions for further learning

Always:
- Use proper honorifics (ﷺ, رضي الله عنه)
- Keep Arabic text complete and accurate
- Cite authentic sources
- Encourage scholarly verification
- Be comprehensive yet clear`
            }
        ];

        sendEvent({ status: 'processing' });

        try {
            console.log('Creating OpenAI stream...');
            const stream = await openai.chat.completions.create({
                model: "gpt-4",
                messages: [...systemMessages, { role: "user", content: message }],
                temperature: 0.7,
                max_tokens: 3000,
                stream: true,
                presence_penalty: 0,
                frequency_penalty: 0
            });

            console.log('Stream created successfully');
            let currentContent = '';
            let lastChunkTime = Date.now();
            let chunkBuffer = '';
            let lastSentContent = '';
            let arabicBuffer = '';
            let inArabicBlock = false;
            let chunkCount = 0;

            // Set a timeout for the entire response
            const responseTimeout = setTimeout(() => {
                console.error('Response timeout reached');
                if (!streamEnded) {
                    console.log('Sending timeout error event');
                    sendEvent({ error: 'Response timeout', message: 'The response took too long. Please try again.' });
                    endStream();
                }
            }, 180000); // 3 minutes

            const sendChunk = (text) => {
                const newContent = text.trim();
                if (newContent && newContent !== lastSentContent) {
                    console.log(`Sending chunk ${++chunkCount}: ${newContent.slice(0, 50)}...`);
                    // Only add newline for section headers or after Arabic text
                    const needsNewline = /^\[.*\]$/.test(newContent) || isArabic(newContent);
                    sendEvent({ chunk: newContent + (needsNewline ? '\n' : ' ') });
                    lastSentContent = newContent;
                    lastChunkTime = Date.now();
                }
            };

            const isArabic = (text) => /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);

            try {
                console.log('Starting stream processing...');
                for await (const chunk of stream) {
                    if (streamEnded) {
                        console.log('Stream ended early');
                        clearTimeout(responseTimeout);
                        break;
                    }
                    
                    const content = chunk.choices[0]?.delta?.content || '';
                    if (content) {
                        currentContent += content;
                        
                        // Handle Arabic text
                        if (isArabic(content)) {
                            console.log('Starting Arabic block');
                            if (!inArabicBlock) {
                                if (chunkBuffer.trim()) {
                                    sendChunk(chunkBuffer);
                                    chunkBuffer = '';
                                }
                                inArabicBlock = true;
                            }
                            arabicBuffer += content;
                        } else {
                            if (inArabicBlock) {
                                console.log('Ending Arabic block');
                                if (arabicBuffer.trim()) {
                                    sendChunk(arabicBuffer);
                                    arabicBuffer = '';
                                }
                                inArabicBlock = false;
                            }
                            chunkBuffer += content;
                        }
                        
                        // Send on section markers
                        if (content.includes('[') && content.includes(']')) {
                            console.log('Found section marker');
                            if (chunkBuffer.trim()) {
                                sendChunk(chunkBuffer);
                                chunkBuffer = '';
                            }
                        }
                        // Send on natural breaks
                        else if (!inArabicBlock && chunkBuffer.length >= 150 && /[.!?؟\n]/.test(chunkBuffer)) {
                            const parts = chunkBuffer.split(/(?<=[.!?؟\n])\s+/);
                            if (parts.length > 1) {
                                sendChunk(parts.slice(0, -1).join(' '));
                                chunkBuffer = parts[parts.length - 1];
                            }
                        }

                        // Log progress every 10 chunks
                        if (chunkCount % 10 === 0) {
                            console.log(`Processed ${chunkCount} chunks so far`);
                        }
                    }

                    // Check for stalled chunks
                    const timeSinceLastChunk = Date.now() - lastChunkTime;
                    if (timeSinceLastChunk > 10000) {
                        console.log(`No chunks received for ${timeSinceLastChunk}ms`);
                        if (arabicBuffer.trim()) {
                            sendChunk(arabicBuffer);
                            arabicBuffer = '';
                            inArabicBlock = false;
                        }
                        if (chunkBuffer.trim()) {
                            sendChunk(chunkBuffer);
                            chunkBuffer = '';
                        }
                    }
                }

                console.log('Stream processing completed');

                // Send any remaining content
                if (arabicBuffer.trim()) {
                    console.log('Sending remaining Arabic buffer');
                    sendChunk(arabicBuffer);
                }
                if (chunkBuffer.trim() && !streamEnded) {
                    console.log('Sending remaining chunk buffer');
                    sendChunk(chunkBuffer);
                }

                if (!streamEnded) {
                    console.log('Stream completed successfully');
                    clearTimeout(responseTimeout);
                    sendEvent({ status: 'complete' });
                }

            } catch (streamError) {
                console.error('Stream processing error:', streamError);
                clearTimeout(responseTimeout);
                if (!streamEnded) {
                    sendEvent({ error: 'Stream processing error', message: streamError.message });
                }
            }

        } catch (error) {
            console.error('Error creating stream:', error);
            if (!streamEnded) {
                sendEvent({ error: 'Error creating stream', message: error.message });
            }
        } finally {
            console.log('Request processing finished');
            endStream();
        }
    } catch (error) {
        console.error('Error processing chat request:', error);
        if (!streamEnded) {
            sendEvent({ error: 'Error processing chat request', message: error.message });
        }
    } finally {
        endStream();
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
