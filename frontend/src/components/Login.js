import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticateUser } from '../utils/auth';
import '../styles.css';
import logo from '../logo2.svg';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [formatWarning, setFormatWarning] = useState('');
  const navigate = useNavigate();

  const validateUsername = (value) => {
    if (value.includes('@')) {
      setFormatWarning('Please enter only your username without @domain.com');
      return false;
    }
    setFormatWarning('');
    return true;
  };

  const handleUsernameChange = (e) => {
    const value = e.target.value;
    setUsername(value);
    validateUsername(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validate format before attempting login
    if (!validateUsername(username)) {
      return;
    }
    
    setLoading(true);

    try {
      const result = await authenticateUser(username, password);

      if (result.success) {
        // Call onLogin if provided
        if (typeof onLogin === 'function') {
          onLogin(result.user);
          navigate('/');
        } else {
          // If no callback provided, just navigate
          navigate('/');
        }
      } else if (result.requiresPassword) {
        setError(result.message);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error('Authentication error:', err);
      setError('Authentication service error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-logo-container">
          <img src={logo} alt="Containerlab Studio Logo" className="login-logo" />
        </div>
        {error && <div className="error">{error}</div>}
        {formatWarning && <div className="warning">{formatWarning}</div>}
        <div className="form-group">
          <input
            type="text"
            value={username}
            onChange={handleUsernameChange}
            placeholder="Enter your username"
            required
          />
        </div>
        
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            />
          </div>
        
        <button type="submit" disabled={loading || formatWarning || !password}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default Login;