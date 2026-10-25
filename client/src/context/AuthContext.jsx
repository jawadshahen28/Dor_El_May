import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCsrfToken } from '../services/api';
import { detachLocalPush, reconcileDevicePush } from '../notifications/pushClient';

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
  useEffect(() => {
    if (status !== 'ready') return;
    if (user?.role === 'resident') reconcileDevicePush().catch(() => {});
    else detachLocalPush().catch(() => {});
  }, [user?.id, user?.role, status]);
  useEffect(() => {
    const revisit = (event) => {
      if (event.type === 'message' && event.data?.type !== 'PUSH_SUBSCRIPTION_CHANGED') return;
      if (navigator.onLine && document.visibilityState === 'visible' && user?.role === 'resident') reconcileDevicePush().catch(() => {});
    };
    window.addEventListener('focus', revisit);
    navigator.serviceWorker?.addEventListener('message', revisit);
    return () => { window.removeEventListener('focus', revisit); navigator.serviceWorker?.removeEventListener('message', revisit); };
  }, [user?.id, user?.role]);
  const authenticate = async (route, values) => {
    const data = await api(`/auth/${route}`, { method: 'POST', body: values });
    await detachLocalPush();
    setUser(data.user);
    setConnectionError('');
  };
  const logout = async () => {
    await detachLocalPush();
    await api('/auth/logout', { method: 'POST' });
    setCsrfToken(null);
    setUser(null);
  };
  const authenticateAdmin = async (values) => {
    const data = await api('/admin/login', { method: 'POST', body: values });
    await detachLocalPush();
    setUser(data.user);
    setConnectionError('');
  };
  const logoutAdmin = async () => {
    await detachLocalPush();
    await api('/admin/logout', { method: 'POST' });
    setCsrfToken(null);
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, status, connectionError, refresh, authenticate, logout, authenticateAdmin, logoutAdmin }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
