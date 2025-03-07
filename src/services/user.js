import { db } from '../config/firebase';
import { doc, updateDoc, getDoc, increment, serverTimestamp } from 'firebase/firestore';

// Update user's question count
export const incrementQuestionCount = async (userId) => {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            questionCount: increment(1),
            lastQuestionDate: serverTimestamp()
        });
    } catch (error) {
        throw error;
    }
};

// Check if user has reached their daily limit
export const checkQuestionLimit = async (userId) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            throw new Error('User not found');
        }

        const userData = userDoc.data();
        const subscription = userData.subscription;

        // If user has a valid subscription, they have unlimited questions
        if (subscription.type !== 'free' && subscription.expiresAt?.toDate() > new Date()) {
            return {
                canAsk: true,
                remaining: Infinity
            };
        }

        // For free users, check daily limit
        const lastQuestionDate = userData.lastQuestionDate?.toDate();
        const today = new Date();
        const isNewDay = !lastQuestionDate || 
            lastQuestionDate.getDate() !== today.getDate() ||
            lastQuestionDate.getMonth() !== today.getMonth() ||
            lastQuestionDate.getFullYear() !== today.getFullYear();

        // Reset count if it's a new day
        if (isNewDay) {
            await updateDoc(doc(db, 'users', userId), {
                questionCount: 0
            });
            return {
                canAsk: true,
                remaining: 7
            };
        }

        const remainingQuestions = 7 - (userData.questionCount || 0);
        return {
            canAsk: remainingQuestions > 0,
            remaining: remainingQuestions
        };
    } catch (error) {
        throw error;
    }
};

// Update user's subscription
export const updateSubscription = async (userId, subscriptionData) => {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            'subscription.type': subscriptionData.type,
            'subscription.expiresAt': subscriptionData.expiresAt,
            'subscription.stripeCustomerId': subscriptionData.stripeCustomerId,
            'subscription.stripeSubscriptionId': subscriptionData.stripeSubscriptionId
        });
    } catch (error) {
        throw error;
    }
};

// Get user's subscription status
export const getSubscriptionStatus = async (userId) => {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) {
            throw new Error('User not found');
        }

        const userData = userDoc.data();
        return {
            type: userData.subscription.type,
            expiresAt: userData.subscription.expiresAt?.toDate(),
            isActive: userData.subscription.type !== 'free' && 
                     userData.subscription.expiresAt?.toDate() > new Date()
        };
    } catch (error) {
        throw error;
    }
};
