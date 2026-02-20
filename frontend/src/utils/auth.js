import axios from 'axios';
import { AUTH_API_URL } from './config';

// Configure axios with the base URL of our authentication API
const API_BASE_URL = AUTH_API_URL;

// Create an axios instance with the base URL
const api = axios.create({
  baseURL: API_BASE_URL
});

// Store the current user in memory
let currentUser = null;

export const authenticateUser = async (username, password = null) => {
  if (!username) {
    return {
      success: false,
      message: 'Username is required'
    };
  }
  
  if (!password) {
    return {
      success: false,
      message: 'Password required',
      requiresPassword: true
    };
  }
  
  try {
    // Call the authentication API
    const response = await api.post('/api/auth/verify-user', {
      username,
      password
    });
    
    if (response.data.success) {
      // Store the current user
      setCurrentUser(response.data.user);
      
      return {
        success: true,
        user: response.data.user
      };
    } else {
      return {
        success: false,
        message: response.data.message || 'Authentication failed'
      };
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      message: error.response?.data?.message || 'Authentication service unavailable'
    };
  }
};

// Set the current user
export const setCurrentUser = (user) => {
  currentUser = user;
  // Also store in localStorage for persistence across page refreshes
  if (user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
  } else {
    localStorage.removeItem('currentUser');
  }
};

// Get the current user
export const getCurrentUser = () => {
  // If currentUser is null, try to get from localStorage
  if (!currentUser) {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        currentUser = JSON.parse(storedUser);
      } catch (e) {
        console.error('Error parsing stored user:', e);
      }
    }
  }
  return currentUser;
};

// Check if the current user is an admin
export const isAdmin = () => {
  const user = getCurrentUser();
  return user && user.role === 'admin';
};

// Logout function
export const logout = () => {
  setCurrentUser(null);
};