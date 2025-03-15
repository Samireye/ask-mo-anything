import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import admin from 'firebase-admin';
import { inject } from '@vercel/analytics';

// Load environment variables
dotenv.config();

// Validate environment variables
if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
}

// Initialize Vercel Analytics
inject();

// Initialize Firebase
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDn_yz3eL1c4cxxaChd2YFx8TReFYSWI-Q",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "ask-mo-anything.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "ask-mo-anything",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "ask-mo-anything.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "31573817503",
    appId: process.env.FIREBASE_APP_ID || "1:31573817503:web:b8f5c3a066b3cb4243b69d"
};

// Initialize Firebase client SDK
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// Initialize Firebase Admin SDK for token verification
// Note: In production, use environment variables or secure storage for service account

// Import fs module to read the service account key file
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if Firebase Admin SDK is already initialized
if (!admin.apps.length) {
    try {
        // Initialize Firebase Admin without credentials for basic functionality
        // This will allow the server to run but with limited admin capabilities
        admin.initializeApp({
            projectId: firebaseConfig.projectId,
        });
        console.log('Firebase Admin initialized with basic configuration');
    } catch (error) {
        console.error('Firebase admin initialization error:', error);
        // Continue without admin SDK - some features might be limited
        console.log('Continuing without Firebase Admin SDK');
    }
}

const app = express();

// Trust proxy - required for rate limiting on Vercel
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
    origin: ['https://ask-mo-anything.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Platform', 'X-Mobile-Dev', 'X-User-Id', 'X-Auth-Token'],
    exposedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-User-Id']
}));

app.use(express.json());

// Set port
const port = process.env.PORT || 3001;

// Serve static files from the public directory
app.use(express.static('public'));

// Root route
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: './public' });
});

// Initialize waitlist collection
app.get('/api/init-waitlist', async (req, res) => {
    try {
        // Get Firestore from admin
        const adminDb = admin.firestore();
        
        // Check if collection exists
        const collectionRef = adminDb.collection('mobileAppWaitlist');
        const snapshot = await collectionRef.limit(1).get();
        
        if (snapshot.empty) {
            // Create the collection with a dummy document that we'll delete right away
            const dummyDoc = await collectionRef.add({
                _init: true,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Delete the dummy document
            await dummyDoc.delete();
            
            console.log('mobileAppWaitlist collection initialized successfully');
            res.status(200).json({ success: true, message: 'Waitlist collection initialized' });
        } else {
            console.log('mobileAppWaitlist collection already exists');
            res.status(200).json({ success: true, message: 'Waitlist collection already exists' });
        }
    } catch (error) {
        console.error('Error initializing waitlist collection:', error);
        res.status(500).json({ success: false, error: error.message });
    }
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

// Rate limiting configuration
const WINDOW_SIZE = 24 * 60 * 60 * 1000; // 24 hour (daily) window
const QUESTIONS_PER_WINDOW = 7; // 7 questions per day
const MAX_WINDOWS = 2; // Keep 2 days of history

// Store for tracking questions with automatic cleanup
class QuestionTracker {
    constructor() {
        this.store = new Map();
        
        // Cleanup expired entries every hour
        setInterval(() => this.cleanup(), 60 * 60 * 1000);
    }

    generateKey(req) {
        const components = [
            req.ip,
            req.headers['user-agent'] || '',
            req.headers['accept-language'] || ''
        ];
        return crypto.createHash('sha256').update(components.join('|')).digest('hex');
    }

    getQuestionCount(key) {
        const data = this.store.get(key);
        if (!data) return 0;
        
        const now = Date.now();
        const currentWindow = Math.floor(now / WINDOW_SIZE);
        
        // Filter to only include questions from current window
        const recentQuestions = data.filter(timestamp => 
            Math.floor(timestamp / WINDOW_SIZE) === currentWindow
        );
        
        return recentQuestions.length;
    }

    addQuestion(key) {
        const timestamps = this.store.get(key) || [];
        const now = Date.now();
        
        // Add new timestamp
        timestamps.push(now);
        
        // Keep only recent windows
        const oldestAllowed = now - (WINDOW_SIZE * MAX_WINDOWS);
        const filtered = timestamps.filter(ts => ts > oldestAllowed);
        
        this.store.set(key, filtered);
        return this.getQuestionCount(key);
    }

    cleanup() {
        const now = Date.now();
        const oldestAllowed = now - (WINDOW_SIZE * MAX_WINDOWS);
        
        for (const [key, timestamps] of this.store.entries()) {
            const filtered = timestamps.filter(ts => ts > oldestAllowed);
            if (filtered.length === 0) {
                this.store.delete(key);
            } else {
                this.store.set(key, filtered);
            }
        }
    }
}

const questionTracker = new QuestionTracker();

// Authentication middleware
const authenticateUser = async (req, res, next) => {
    try {
        // Get the auth token from the request headers
        const authToken = req.headers['x-auth-token'];
        
        if (authToken) {
            // Verify the Firebase ID token
            const decodedToken = await admin.auth().verifyIdToken(authToken);
            
            // Add the verified user to the request object
            req.user = decodedToken;
            req.userId = decodedToken.uid;
            
            console.log(`Authenticated user: ${req.userId}`);
        } else {
            // No token provided, user is not authenticated
            req.user = null;
            req.userId = null;
        }
        
        // Continue to the next middleware regardless of authentication status
        next();
    } catch (error) {
        console.error('Error verifying auth token:', error);
        // Invalid token, but still continue to next middleware
        req.user = null;
        req.userId = null;
        next();
    }
};

// Function to update user subscription status
async function updateUserSubscription(userId, planType, paymentId) {
    try {
        // Get current date for subscription start
        const now = new Date();
        
        // Set subscription end date based on plan type
        let endDate = new Date();
        if (planType === 'monthly') {
            endDate.setMonth(endDate.getMonth() + 1);
        } else if (planType === 'annual') {
            endDate.setFullYear(endDate.getFullYear() + 1);
        } else {
            throw new Error('Invalid plan type');
        }
        
        // Update user document with subscription information
        const userRef = doc(db, 'users', userId);
        
        // First check if user document exists
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
            // Update existing user document
            await updateDoc(userRef, {
                subscription: {
                    type: 'premium',
                    plan: planType,
                    startDate: now.toISOString(),
                    endDate: endDate.toISOString(),
                    paymentId: paymentId,
                    active: true,
                    questionLimit: planType === 'monthly' ? 100 : 100, // Both plans have same question limit
                    updatedAt: now.toISOString()
                }
            });
        } else {
            // Create new user document
            await setDoc(userRef, {
                userId: userId,
                createdAt: now.toISOString(),
                subscription: {
                    type: 'premium',
                    plan: planType,
                    startDate: now.toISOString(),
                    endDate: endDate.toISOString(),
                    paymentId: paymentId,
                    active: true,
                    questionLimit: planType === 'monthly' ? 100 : 100, // Both plans have same question limit
                    updatedAt: now.toISOString()
                }
            });
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error updating subscription:', error);
        return { success: false, error: error.message };
    }
}

// API endpoint to check premium status
app.get('/api/check-premium', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const isTestMode = req.query.test === 'true';
    
    if (!userId && !isTestMode) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Use a test user ID if in test mode
    const effectiveUserId = isTestMode ? 'test-user-123' : userId;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', effectiveUserId));
        let isPremium = false;
        let subscriptionDetails = null;
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.subscription && 
                userData.subscription.type === 'premium' && 
                userData.subscription.active) {
                
                // Check if subscription is still valid (not expired)
                const now = new Date();
                const endDate = new Date(userData.subscription.endDate);
                
                if (now <= endDate) {
                    isPremium = true;
                    subscriptionDetails = {
                        plan: userData.subscription.plan,
                        startDate: userData.subscription.startDate,
                        endDate: userData.subscription.endDate,
                        questionLimit: userData.subscription.questionLimit
                    };
                } else {
                    // Subscription expired, update the status
                    try {
                        await updateDoc(doc(db, 'users', effectiveUserId), {
                            'subscription.active': false
                        });
                    } catch (updateError) {
                        console.error('Error updating expired subscription:', updateError);
                    }
                }
            }
        }
        
        res.json({ 
            isPremium, 
            subscriptionDetails,
            userId: effectiveUserId,
            testMode: isTestMode
        });
    } catch (error) {
        console.error('Error checking premium status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to verify payment and activate subscription
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { userId, paymentId, planType } = req.body;
        const isTestMode = req.query.test === 'true';
        
        if ((!userId || !paymentId || !planType) && !isTestMode) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Use default values for test mode
        const effectiveUserId = isTestMode ? 'test-user-123' : userId;
        const effectivePaymentId = paymentId || `test-payment-${Date.now()}`;
        const effectivePlanType = planType || 'monthly';
        
        // Validate plan type
        if (effectivePlanType !== 'monthly' && effectivePlanType !== 'annual') {
            return res.status(400).json({ error: 'Invalid plan type' });
        }
        
        // In a production environment, you would verify the payment with Stripe here
        // For now, we'll assume the payment is valid and update the subscription
        
        const result = await updateUserSubscription(effectiveUserId, effectivePlanType, effectivePaymentId);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Subscription activated successfully',
                plan: effectivePlanType,
                userId: effectiveUserId,
                testMode: isTestMode
            });
        } else {
            res.status(400).json({ error: result.error || 'Payment verification failed' });
        }
    } catch (error) {
        console.error('Error in payment verification:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Apply authentication middleware to all routes
app.use(authenticateUser);

// Middleware to check question limit
const checkQuestionLimit = async (req, res, next) => {
    const userApiKey = req.headers['x-api-key'];
    const platform = req.headers['x-platform'];
    const mobileDevKey = req.headers['x-mobile-dev'];
    
    // Legacy mobile auth for backward compatibility
    if (platform === 'mobile' && 
        ((process.env.NODE_ENV === 'development' && mobileDevKey === process.env.MOBILE_DEV_KEY) ||
         (process.env.NODE_ENV === 'production' && userApiKey === process.env.MOBILE_API_KEY))) {
        return next();
    }

    // If user has their own API key, bypass the limit
    if (userApiKey) {
        return next();
    }

    // Check if authenticated user has premium subscription
    if (req.userId) {
        try {
            const userDoc = await getDoc(doc(db, 'users', req.userId));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.subscription && 
                    userData.subscription.type === 'premium' && 
                    userData.subscription.active) {
                    
                    // Check if subscription is still valid (not expired)
                    const now = new Date();
                    const endDate = new Date(userData.subscription.endDate);
                    
                    if (now <= endDate) {
                        // Valid subscription, bypass the limit
                        return next();
                    } else {
                        // Subscription expired, update the status
                        try {
                            await updateDoc(doc(db, 'users', req.userId), {
                                'subscription.active': false
                            });
                            console.log(`Subscription expired for user ${req.userId}, marked as inactive`);
                        } catch (updateError) {
                            console.error('Error updating expired subscription:', updateError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error checking user subscription:', error);
            // Continue with normal limit checking if there's an error
        }
    }

    const userKey = questionTracker.generateKey(req);
    const currentCount = questionTracker.getQuestionCount(userKey);
    
    if (currentCount >= QUESTIONS_PER_WINDOW) {
        return res.status(429).json({
            error: 'Daily question limit reached',
            message: `You've reached your daily limit of ${QUESTIONS_PER_WINDOW} questions. To continue using our platform, you can either get your own OpenAI API key for unlimited access, sign up for a premium subscription, or support our project on Buy Me a Coffee.`,
            questionCount: currentCount,
            limit: QUESTIONS_PER_WINDOW,
            windowSize: 'day'
        });
    }

    questionTracker.addQuestion(userKey);
    next();
};

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

// Function to get current Hijri date
function getCurrentHijriDate() {
    try {
        const today = new Date();
        console.log('Converting date:', today);
        
        // Julian date calculation
        const jd = Math.floor((today.getTime() / 86400000) + 2440587.5);
        
        // Chronological Julian Date
        const cjd = jd - 1948440;
        
        // Islamic Calendar Calculation
        const quotient = Math.floor(cjd / 10631);
        const remainder = cjd % 10631;
        
        const year = quotient * 30 + Math.floor(remainder / 354.36667);
        const monthDays = remainder % 354.36667;
        
        // Calculate month
        const monthArray = [0, 30, 59, 89, 118, 148, 177, 207, 236, 266, 295, 325];
        let month = 0;
        for (let i = 11; i >= 0; i--) {
            if (monthDays >= monthArray[i]) {
                month = i + 1;
                break;
            }
        }
        
        const day = Math.ceil(monthDays - monthArray[month - 1]);
        
        const monthNames = [
            'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani',
            'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', 'Shaban',
            'Ramadan', 'Shawwal', 'Dhu al-Qadah', 'Dhu al-Hijjah'
        ];
        
        const result = {
            day,
            month,
            year: year + 1,
            monthName: monthNames[month - 1],
            format: `${day} ${monthNames[month - 1]} ${year + 1}`
        };
        
        console.log('Formatted result:', result);
        return result;
    } catch (error) {
        console.error('Error getting Hijri date:', error);
        throw error;
    }
}

// Chat endpoint
app.post('/api/chat', validateInput, checkQuestionLimit, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Handle client disconnection
    req.on('close', () => {
        console.log('Client disconnected, attempting to end stream');
        streamEnded = true;
        try {
            if (stream && stream.controller) {
                console.log('Aborting stream...');
                stream.controller.abort();
                console.log('Stream aborted successfully');
            } else {
                console.log('No stream to abort');
            }
        } catch (error) {
            console.error('Error aborting stream:', error);
        }
        endStream();
    });

    // Handle client errors
    req.on('error', (error) => {
        console.error('Request error:', error);
        streamEnded = true;
    });

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
                sendEvent({ status: 'complete' });
                res.end();
            } catch (error) {
                console.error('Error ending stream:', error);
            }
        }
    };

    let stream;
    try {
        console.log('Starting chat request processing');

        // Check if message is asking about Islamic date
        const dateKeywords = [
            'islamic date',
            'hijri date',
            'islamic calendar',
            'what date is it',
            'current islamic date',
            'current hijri date'
        ];

        const isDateQuery = dateKeywords.some(keyword => 
            req.body.message.toLowerCase().includes(keyword.toLowerCase())
        );

        if (isDateQuery) {
            try {
                const hijriDate = getCurrentHijriDate();
                console.log('Got Hijri date:', hijriDate);
                
                const response = `Today's date in the Islamic calendar is ${hijriDate.day} ${hijriDate.monthName} ${hijriDate.year} AH (${hijriDate.format}).`;
                console.log('Sending response:', response);
                
                // Send the response as a chunk
                sendEvent({
                    chunk: response,
                    status: 'streaming'
                });
                
                // Send completion event
                sendEvent({
                    status: 'complete'
                });
                return;
            } catch (error) {
                console.error('Error handling date query:', error);
                sendEvent({
                    error: 'Failed to get Islamic calendar date: ' + error.message
                });
                return;
            }
        }
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

IMPORTANT: For questions about Ramadan, duas, fasting, or iftar, you MUST include relevant Quran verses such as:
- Surah Al-Baqarah 2:183-187 about fasting
- Surah Al-Baqarah 2:185 about Ramadan
- Other relevant verses about prayer, supplication, or worship

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

1. What did Prophet Muhammad ﷺ say about...
2. How did Prophet Muhammad ﷺ handle...
3. What guidance did Prophet Muhammad ﷺ give...
4. What lessons can we learn from...

Always:
- For Prophet Muhammad, use ﷺ in the main text
- For companions and others:
  * Use (RA) instead of رضي الله عنه/عنها in [RELATED TOPICS]
  * Use رضي الله عنه/عنها inline in main text only
- Keep Arabic text complete and accurate
- Cite authentic sources
- Encourage scholarly verification
- Be comprehensive yet clear`
            }
        ];

        sendEvent({ status: 'processing' });

        try {
            console.log('Creating OpenAI stream...');
            const controller = new AbortController();
            stream = await openai.chat.completions.create({
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
                        console.log('Stream ended early, breaking loop');
                        clearTimeout(responseTimeout);
                        try {
                            controller.abort();
                            console.log('Stream aborted in loop');
                        } catch (error) {
                            console.error('Error aborting stream in loop:', error);
                        }
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
                    if (timeSinceLastChunk > 5000) { // Reduced from 10s to 5s for faster feedback
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

                // Force send any remaining buffers before completing
                if (!streamEnded) {
                    console.log('Stream completed successfully');
                    clearTimeout(responseTimeout);
                    
                    // Force send any remaining content
                    if (arabicBuffer.trim()) {
                        sendChunk(arabicBuffer);
                        arabicBuffer = '';
                        inArabicBlock = false;
                    }
                    if (chunkBuffer.trim()) {
                        sendChunk(chunkBuffer);
                        chunkBuffer = '';
                    }
                    
                    // Send complete status
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

// API endpoint to check premium status
app.get('/api/check-premium', async (req, res) => {
    const userId = req.headers['x-user-id'];
    const isTestMode = req.query.test === 'true';
    
    if (!userId && !isTestMode) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Use a test user ID if in test mode
    const effectiveUserId = isTestMode ? 'test-user-123' : userId;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', effectiveUserId));
        let isPremium = false;
        let subscriptionDetails = null;
        
        if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.subscription && 
                userData.subscription.type === 'premium' && 
                userData.subscription.active) {
                
                // Check if subscription is still valid (not expired)
                const now = new Date();
                const endDate = new Date(userData.subscription.endDate);
                
                if (now <= endDate) {
                    isPremium = true;
                    subscriptionDetails = {
                        plan: userData.subscription.plan,
                        startDate: userData.subscription.startDate,
                        endDate: userData.subscription.endDate,
                        questionLimit: userData.subscription.questionLimit
                    };
                } else {
                    // Subscription expired, update the status
                    try {
                        await updateDoc(doc(db, 'users', userId), {
                            'subscription.active': false
                        });
                    } catch (updateError) {
                        console.error('Error updating expired subscription:', updateError);
                    }
                }
            }
        }
        
        res.json({ 
            isPremium, 
            subscriptionDetails,
            userId: effectiveUserId,
            testMode: isTestMode
        });
    } catch (error) {
        console.error('Error checking premium status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to verify payment and activate subscription
app.post('/api/verify-payment', async (req, res) => {
    try {
        const { userId, paymentId, planType } = req.body;
        const isTestMode = req.query.test === 'true';
        
        if ((!userId || !paymentId || !planType) && !isTestMode) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        // Use default values for test mode
        const effectiveUserId = isTestMode ? 'test-user-123' : userId;
        const effectivePaymentId = paymentId || `test-payment-${Date.now()}`;
        const effectivePlanType = planType || 'monthly';
        
        // Validate plan type
        if (effectivePlanType !== 'monthly' && effectivePlanType !== 'annual') {
            return res.status(400).json({ error: 'Invalid plan type' });
        }
        
        // In a production environment, you would verify the payment with Stripe here
        // For now, we'll assume the payment is valid and update the subscription
        
        const result = await updateUserSubscription(effectiveUserId, effectivePlanType, effectivePaymentId);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: 'Subscription activated successfully',
                plan: effectivePlanType,
                userId: effectiveUserId,
                testMode: isTestMode
            });
        } else {
            res.status(400).json({ error: result.error || 'Payment verification failed' });
        }
    } catch (error) {
        console.error('Error in payment verification:', error);
        res.status(500).json({ error: 'Internal server error' });
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

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// API endpoint to add email to mobile app waitlist
app.post('/api/addToWaitlist', async (req, res) => {
    try {
        const { email, source } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Get Firestore database from the already initialized admin SDK
        const db = admin.firestore();
        
        // Add email to waitlist collection
        await db.collection('mobileAppWaitlist').add({
            email: email,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            source: source || 'website_footer'
        });
        
        res.json({ success: true, message: 'Added to waitlist successfully' });
    } catch (error) {
        console.error('Error adding to waitlist:', error);
        res.status(500).json({ error: 'Failed to add to waitlist' });
    }
});

// Export the app for serverless deployment
export default app;
