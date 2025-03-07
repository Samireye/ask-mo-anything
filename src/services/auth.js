import { 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendPasswordResetEmail
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

// Create new user with email and password
export const createUser = async (email, password) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Create user document in Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: userCredential.user.email,
            createdAt: serverTimestamp(),
            questionCount: 0,
            lastQuestionDate: null,
            subscription: {
                type: 'free',
                expiresAt: null
            }
        });
        return userCredential.user;
    } catch (error) {
        throw error;
    }
};

// Sign in with email and password
export const signIn = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        throw error;
    }
};

// Sign in with Google
export const signInWithGoogle = async () => {
    try {
        const provider = new GoogleAuthProvider();
        const userCredential = await signInWithPopup(auth, provider);
        
        // Check if user document exists
        const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
        
        // If not, create it
        if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', userCredential.user.uid), {
                email: userCredential.user.email,
                createdAt: serverTimestamp(),
                questionCount: 0,
                lastQuestionDate: null,
                subscription: {
                    type: 'free',
                    expiresAt: null
                }
            });
        }
        
        return userCredential.user;
    } catch (error) {
        throw error;
    }
};

// Sign out
export const logOut = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        throw error;
    }
};

// Reset password
export const resetPassword = async (email) => {
    try {
        await sendPasswordResetEmail(auth, email);
    } catch (error) {
        throw error;
    }
};

// Subscribe to auth state changes
export const onAuthChange = (callback) => {
    return onAuthStateChanged(auth, callback);
};

// Get current user's data
export const getUserData = async (userId) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        throw error;
    }
};
