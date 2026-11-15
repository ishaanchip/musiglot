import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch((err) => {
        if (err.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const authenticate = async (mode, email, password) => {
    const d = await api(`/auth/${mode}`, { method: 'POST', body: { email, password } });
    setToken(d.token);
    setUser(d.user);
  };
  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, authenticate, logout }}>{children}</AuthContext.Provider>;
}
