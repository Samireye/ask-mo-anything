// Firebase Authentication UI Integration
import { auth, db } from './config/firebase.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut, 
    sendPasswordResetEmail,
    onAuthStateChanged,
    getIdToken
} from 'firebase/auth';
import { 
    doc, 
    setDoc, 
    getDoc, 
    serverTimestamp 
} from 'firebase/firestore';

// Initialize Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// DOM Elements
let loginButton, signupButton, userProfile, userEmail, logoutButton;
let loginModal, signupModal, resetPasswordModal;
let loginForm, signupForm, resetForm;
let loginEmail, loginPassword, signupEmail, signupPassword, signupConfirmPassword, resetEmail;
let loginSubmit, signupSubmit, resetSubmit, googleSignin, googleSignup;
let loginError, signupError, resetError, resetMessage;
let switchToSignup, switchToLogin, forgotPassword, backToLogin;
let closeButtons;

// Initialize the auth UI when the DOM is loaded
document.addEventListener('DOMContentLoaded', initAuthUI);

function initAuthUI() {
    // Set up API interceptor for auth tokens
    setupApiInterceptor();
    
    // Get DOM elements
    loginButton = document.getElementById('login-button');
    signupButton = document.getElementById('signup-button');
    userProfile = document.getElementById('user-profile');
    userEmail = document.getElementById('user-email');
    logoutButton = document.getElementById('logout-button');
    
    loginModal = document.getElementById('login-modal');
    signupModal = document.getElementById('signup-modal');
    resetPasswordModal = document.getElementById('reset-password-modal');
    
    loginEmail = document.getElementById('login-email');
    loginPassword = document.getElementById('login-password');
    signupEmail = document.getElementById('signup-email');
    signupPassword = document.getElementById('signup-password');
    signupConfirmPassword = document.getElementById('signup-confirm-password');
    resetEmail = document.getElementById('reset-email');
    
    loginSubmit = document.getElementById('login-submit');
    signupSubmit = document.getElementById('signup-submit');
    resetSubmit = document.getElementById('reset-submit');
    googleSignin = document.getElementById('google-signin');
    googleSignup = document.getElementById('google-signup');
    
    loginError = document.getElementById('login-error');
    signupError = document.getElementById('signup-error');
    resetError = document.getElementById('reset-error');
    resetMessage = document.getElementById('reset-message');
    
    switchToSignup = document.getElementById('switch-to-signup');
    switchToLogin = document.getElementById('switch-to-login');
    forgotPassword = document.getElementById('forgot-password');
    backToLogin = document.getElementById('back-to-login');
    
    closeButtons = document.querySelectorAll('.close-modal');
    
    // Add event listeners
    loginButton.addEventListener('click', () => showModal(loginModal));
    signupButton.addEventListener('click', () => showModal(signupModal));
    logoutButton.addEventListener('click', handleLogout);
    
    loginSubmit.addEventListener('click', handleLogin);
    signupSubmit.addEventListener('click', handleSignup);
    resetSubmit.addEventListener('click', handlePasswordReset);
    
    googleSignin.addEventListener('click', () => handleGoogleAuth(true));
    googleSignup.addEventListener('click', () => handleGoogleAuth(false));
    
    switchToSignup.addEventListener('click', () => {
        hideModal(loginModal);
        showModal(signupModal);
    });
    
    switchToLogin.addEventListener('click', () => {
        hideModal(signupModal);
        showModal(loginModal);
    });
    
    forgotPassword.addEventListener('click', () => {
        hideModal(loginModal);
        showModal(resetPasswordModal);
    });
    
    backToLogin.addEventListener('click', () => {
        hideModal(resetPasswordModal);
        showModal(loginModal);
    });
    
    closeButtons.forEach(button => {
        button.addEventListener('click', () => {
            hideModal(loginModal);
            hideModal(signupModal);
            hideModal(resetPasswordModal);
        });
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === loginModal) hideModal(loginModal);
        if (event.target === signupModal) hideModal(signupModal);
        if (event.target === resetPasswordModal) hideModal(resetPasswordModal);
    });
    
    // Listen for auth state changes
    onAuthStateChanged(auth, handleAuthStateChange);
}

// Authentication functions
async function handleLogin(event) {
    event.preventDefault();
    
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    if (!email || !password) {
        showError(loginError, 'Please enter both email and password');
        return;
    }
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
        hideModal(loginModal);
        clearInputs();
    } catch (error) {
        handleAuthError(error, loginError);
    }
}

async function handleSignup(event) {
    event.preventDefault();
    
    const email = signupEmail.value.trim();
    const password = signupPassword.value;
    const confirmPassword = signupConfirmPassword.value;
    
    if (!email || !password || !confirmPassword) {
        showError(signupError, 'Please fill in all fields');
        return;
    }
    
    if (password !== confirmPassword) {
        showError(signupError, 'Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        showError(signupError, 'Password must be at least 6 characters');
        return;
    }
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await createUserProfile(userCredential.user);
        hideModal(signupModal);
        clearInputs();
    } catch (error) {
        handleAuthError(error, signupError);
    }
}

async function handleGoogleAuth(isSignIn) {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        
        // Check if this is a new user
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
            await createUserProfile(user);
        }
        
        hideModal(loginModal);
        hideModal(signupModal);
    } catch (error) {
        handleAuthError(error, isSignIn ? loginError : signupError);
    }
}

async function handleLogout() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

async function handlePasswordReset(event) {
    event.preventDefault();
    
    const email = resetEmail.value.trim();
    
    if (!email) {
        showError(resetError, 'Please enter your email address');
        return;
    }
    
    try {
        await sendPasswordResetEmail(auth, email);
        resetMessage.textContent = 'Password reset email sent! Check your inbox.';
        resetMessage.style.color = 'green';
        resetError.textContent = '';
    } catch (error) {
        handleAuthError(error, resetError);
        resetMessage.textContent = '';
    }
}

async function createUserProfile(user) {
    try {
        await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            createdAt: serverTimestamp(),
            questionCount: 0,
            lastQuestionDate: null,
            subscription: {
                type: 'free',
                expiresAt: null
            }
        });
    } catch (error) {
        console.error('Error creating user profile:', error);
    }
}

// Store auth token in localStorage
async function storeAuthToken(user) {
    if (!user) return null;
    
    try {
        const token = await getIdToken(user, true); // Force refresh the token
        localStorage.setItem('authToken', token);
        return token;
    } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
    }
}

// Get the stored auth token
function getStoredAuthToken() {
    return localStorage.getItem('authToken');
}

// Clear the stored auth token
function clearStoredAuthToken() {
    localStorage.removeItem('authToken');
}

// Add auth token to API requests
function setupApiInterceptor() {
    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async function(url, options = {}) {
        // Only intercept requests to our API
        if (url.includes('/api/')) {
            const token = getStoredAuthToken();
            if (token) {
                // Create headers object if it doesn't exist
                options.headers = options.headers || {};
                
                // Add the auth token to the headers
                options.headers['X-Auth-Token'] = token;
            }
        }
        
        return originalFetch.call(this, url, options);
    };
}

async function handleAuthStateChange(user) {
    if (user) {
        // User is signed in
        loginButton.style.display = 'none';
        signupButton.style.display = 'none';
        userProfile.style.display = 'flex';
        userEmail.textContent = user.email;
        
        // Get and store the auth token
        await storeAuthToken(user);
        
        // Update UI for authenticated user
        document.body.classList.add('user-authenticated');
    } else {
        // User is signed out
        loginButton.style.display = 'block';
        signupButton.style.display = 'block';
        userProfile.style.display = 'none';
        userEmail.textContent = '';
        
        // Clear the stored auth token
        clearStoredAuthToken();
        
        // Update UI for non-authenticated user
        document.body.classList.remove('user-authenticated');
    }
}

// Helper functions
function showModal(modal) {
    if (modal) modal.style.display = 'block';
}

function hideModal(modal) {
    if (modal) modal.style.display = 'none';
}

function clearInputs() {
    loginEmail.value = '';
    loginPassword.value = '';
    signupEmail.value = '';
    signupPassword.value = '';
    signupConfirmPassword.value = '';
    resetEmail.value = '';
    
    loginError.textContent = '';
    signupError.textContent = '';
    resetError.textContent = '';
    resetMessage.textContent = '';
}

function showError(element, message) {
    if (element) element.textContent = message;
}

function handleAuthError(error, errorElement) {
    let errorMessage = 'An error occurred. Please try again.';
    
    switch (error.code) {
        case 'auth/email-already-in-use':
            errorMessage = 'This email is already in use. Please use a different email or sign in.';
            break;
        case 'auth/invalid-email':
            errorMessage = 'Invalid email address. Please check your email.';
            break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            errorMessage = 'Invalid email or password. Please try again.';
            break;
        case 'auth/weak-password':
            errorMessage = 'Password is too weak. Please use a stronger password.';
            break;
        case 'auth/popup-closed-by-user':
            errorMessage = 'Sign-in popup was closed before completing the sign in.';
            break;
        case 'auth/cancelled-popup-request':
            errorMessage = 'The sign-in popup was cancelled.';
            break;
        case 'auth/popup-blocked':
            errorMessage = 'Sign-in popup was blocked by the browser. Please allow popups for this site.';
            break;
        default:
            console.error('Auth error:', error);
    }
    
    showError(errorElement, errorMessage);
}

export { initAuthUI, getStoredAuthToken };
