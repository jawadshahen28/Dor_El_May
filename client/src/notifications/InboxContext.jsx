import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

const InboxContext = createContext(null);
export function InboxProvider({ children }) {
  const { user, status } = useAuth();
  const owner = status === 'ready' && user?.role === 'resident' ? user.id : null;
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const [state, setState] = useState({ owner: null, count: null });
  const request = useRef(null), lastRead = useRef(0), revision = useRef(0);
  const updateCount = useCallback((count) => {
    if (owner && currentOwner.current === owner && Number.isSafeInteger(count) && count >= 0) { revision.current++; setState({ owner, count }); }
  }, [owner]);
  const refreshCount = useCallback(async (force = false) => {
    if (!owner || request.current || (!force && Date.now() - lastRead.current < 10000)) return;
    const controller = new AbortController(); request.current = controller;
    const version = revision.current;
    try {
      const data = await api('/notifications/unread-count', { signal: controller.signal });
      if (!controller.signal.aborted && version === revision.current) { updateCount(data.unreadCount); lastRead.current = Date.now(); }
    } catch { /* Retain an honest last known count on refresh failure. */ }
    finally { if (request.current === controller) request.current = null; }
  }, [owner, updateCount]);
  useEffect(() => {
    lastRead.current = 0; refreshCount(true);
    const revisit = () => { if (document.visibilityState === 'visible' && navigator.onLine) refreshCount(); };
    window.addEventListener('focus', revisit); window.addEventListener('pageshow', revisit);
    document.addEventListener('visibilitychange', revisit);
    const interval = setInterval(revisit, 60000);
    return () => { request.current?.abort(); request.current = null; clearInterval(interval); window.removeEventListener('focus', revisit); window.removeEventListener('pageshow', revisit); document.removeEventListener('visibilitychange', revisit); };
  }, [refreshCount]);
  return <InboxContext.Provider value={{ unreadCount: owner && state.owner === owner ? state.count : null, updateCount, refreshCount }}>{children}</InboxContext.Provider>;
}
export const useInbox = () => useContext(InboxContext);
