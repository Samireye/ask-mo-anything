import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Use environment variables if available, otherwise use the provided configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyCbaHuXWm5n9IQ91JjQhR5UwgCcvPe8_VE",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "ask-mo-anything-web.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "ask-mo-anything-web",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "ask-mo-anything-web.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "9830805398",
    appId: process.env.FIREBASE_APP_ID || "1:9830805398:web:697c4fa5f093fcfd0d37b7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
