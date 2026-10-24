import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export function useHomeSummary(onSessionExpired) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);

  const refresh = useCallback(async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    setError('');
    try {
      const data = await api('/home/summary', { signal: controller.signal });
      if (!controller.signal.aborted) setSummary(data);
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      if (failure.status === 401) { await onSessionExpired(); return; }
      setError(failure.message);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [onSessionExpired]);

  useEffect(() => {
    refresh();
    const revisit = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', revisit);
    window.addEventListener('pageshow', revisit);
    document.addEventListener('visibilitychange', revisit);
    return () => {
      request.current?.abort();
      request.current = null;
      window.removeEventListener('focus', revisit);
      window.removeEventListener('pageshow', revisit);
      document.removeEventListener('visibilitychange', revisit);
    };
  }, [refresh]);
  return { summary, loading, refreshing, error, refresh };
}
