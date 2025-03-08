// This test script uses CommonJS format for Node.js compatibility
const { 
  createUser, 
  signIn, 
  signInWithGoogle, 
  logOut, 
  getUserData 
} = require('./services/auth.js');

// Test email authentication
const testEmailAuth = async () => {
  try {
    console.log('Testing email authentication...');
    
    // Test user credentials - CHANGE THESE to test with your own email
    const testEmail = 'test@example.com';
    const testPassword = 'Test123!';
    
    // Try to create a new user (this will fail if the user already exists)
    try {
      console.log(`Attempting to create user with email: ${testEmail}`);
      const newUser = await createUser(testEmail, testPassword);
      console.log('User created successfully!', newUser.uid);
    } catch (error) {
      console.log('User creation failed (may already exist):', error.message);
    }
    
    // Try to sign in
    try {
      console.log(`Attempting to sign in with email: ${testEmail}`);
      const user = await signIn(testEmail, testPassword);
      console.log('Sign in successful!', user.uid);
      
      // Get user data
      const userData = await getUserData(user.uid);
      console.log('User data:', userData);
      
      // Sign out
      await logOut();
      console.log('Signed out successfully!');
    } catch (error) {
      console.log('Sign in failed:', error.message);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Run the test
testEmailAuth().then(() => {
  console.log('Email authentication test completed');
  process.exit(0);
}).catch(error => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
