import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Use environment variables if available, otherwise use the provided configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyDn_yz3eL1c4cxxaChd2YFx8TReFYSWI-Q",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "ask-mo-anything.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "ask-mo-anything",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "ask-mo-anything.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "31573817503",
    appId: process.env.FIREBASE_APP_ID || "1:31573817503:web:b8f5c3a066b3cb4243b69d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
