// Test script for subscription functionality
import fetch from 'node-fetch';

// Configuration
const API_URL = 'http://localhost:3001'; // Using port 3001 where the API is running
const USER_ID = 'test-user-123'; // Change to a test user ID
const PAYMENT_ID = 'test-payment-' + Date.now(); // Simulate a payment ID

// Test functions
async function testVerifyPayment() {
  console.log('Testing payment verification and subscription activation...');
  
  try {
    const response = await fetch(`${API_URL}/api/verify-payment?test=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: USER_ID,
        paymentId: PAYMENT_ID,
        planType: 'monthly' // or 'annual'
      })
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    if (data.success) {
      console.log('✅ Payment verification successful!');
      return true;
    } else {
      console.log('❌ Payment verification failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('Error testing payment verification:', error);
    return false;
  }
}

async function testCheckPremium() {
  console.log('\nTesting premium status check...');
  
  try {
    const response = await fetch(`${API_URL}/api/check-premium?test=true`, {
      method: 'GET',
      headers: {
        'x-user-id': USER_ID
      }
    });
    
    const data = await response.json();
    console.log('Response:', data);
    
    if (data.isPremium) {
      console.log('✅ User has premium status!');
      console.log('Subscription details:', data.subscriptionDetails);
    } else {
      console.log('❌ User does not have premium status.');
    }
    
    return data;
  } catch (error) {
    console.error('Error testing premium status:', error);
    return null;
  }
}



// Run tests
async function runTests() {
  console.log('=== SUBSCRIPTION FUNCTIONALITY TESTS ===');
  
  // First check current premium status
  await testCheckPremium();
  
  // Then verify payment and activate subscription
  const paymentSuccess = await testVerifyPayment();
  
  if (paymentSuccess) {
    // Check premium status again after payment
    await testCheckPremium();
  }
  
  console.log('\n=== TESTS COMPLETED ===');
}

// Add a simple direct test for the API endpoints
async function directApiTest() {
  try {
    console.log('\n=== DIRECT API ENDPOINT TEST ===');
    console.log('Making a direct GET request to the API root...');
    
    const response = await fetch(API_URL);
    const text = await response.text();
    
    console.log(`Status: ${response.status}`);
    console.log(`Response: ${text.substring(0, 100)}...`);
    
    return response.ok;
  } catch (error) {
    console.error('Error testing API directly:', error.message);
    return false;
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});
