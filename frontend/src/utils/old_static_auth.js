const fs = require('fs');
const path = require('path');

const authenticateUser = (username, password) => {
  try {
    // Read users from config file
    const usersPath = path.join(__dirname, '..', 'config', 'users.json');
    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    
    // Find user with matching credentials
    const user = users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }

    // Return user info without password
    return {
      success: true,
      user: {
        username: user.username,
        role: user.role
      }
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
};

module.exports = {
  authenticateUser
}; 