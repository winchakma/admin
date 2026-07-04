import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:5000' : '';

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (res.status === 401 || res.status === 403) {
          logout();
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setUser(data.user);
          } else {
            logout();
          }
        }
      } catch (err) {
        console.error("Auth verify failed (network error), keeping token:", err);
        // Do NOT call logout() here! If the backend is sleeping, we don't want to wipe the token.
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [token, API_URL]);

  const login = (userData, jwtToken) => {
    localStorage.setItem('token', jwtToken);
    setToken(jwtToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, API_URL }}>
      {children}
    </AuthContext.Provider>
  );
};
