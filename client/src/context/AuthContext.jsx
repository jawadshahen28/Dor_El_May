import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCsrfToken } from '../services/api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [connectionError, setConnectionError] = useState('');
  const refresh = useCallback(async (signal) => {
    setStatus('loading');
    try {
      const data = await api('/auth/me', { signal });
      setUser(data.user);
      setConnectionError('');
    } catch (error) {
      if (error.name === 'AbortError') return;
      setUser(null);
      setConnectionError(error.message);
    }
    setStatus('ready');
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  const authenticate = async (route, values) => {
    const data = await api(`/auth/${route}`, { method: 'POST', body: values });
    setUser(data.user);
    setConnectionError('');
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setCsrfToken(null);
    setUser(null);
  };
  const authenticateAdmin = async (values) => {
    const data = await api('/admin/login', { method: 'POST', body: values });
    setUser(data.user);
    setConnectionError('');
  };
  const logoutAdmin = async () => {
    await api('/admin/logout', { method: 'POST' });
    setCsrfToken(null);
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, status, connectionError, refresh, authenticate, logout, authenticateAdmin, logoutAdmin }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
