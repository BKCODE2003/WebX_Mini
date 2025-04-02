import { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  // Set auth token for all axios requests
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Load user profile on mount if token exists
  useEffect(() => {
    async function loadUser() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/api/users/me`);
        setCurrentUser(response.data);
      } catch (error) {
        console.error('Failed to load user:', error);
        logout();
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [token]);

  // Login function
  const login = async (usernameOrEmail, password) => {
    try {
      const response = await axios.post(`${API_URL}/api/login`, {
        username: usernameOrEmail,
        password
      });

      const { access_token, user_id, username } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setCurrentUser({ _id: user_id, username });
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.msg || 'Login failed' 
      };
    }
  };

  // Register function
  const register = async (username, email, password) => {
    try {
      const response = await axios.post(`${API_URL}/api/register`, {
        username,
        email,
        password
      });

      const { access_token, user_id } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      setCurrentUser({ _id: user_id, username });
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.msg || 'Registration failed' 
      };
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    token,
    loading,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}