import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export function useAnnouncements({ view = 'all', id }, onSessionExpired) {
  const details = id !== undefined;
  const key = details ? `details:${id}` : `feed:${view}`;
  const [state, setState] = useState({ key, data: null, pending: true, error: '', notFound: false });
  const request = useRef(null);
  const load = useCallback(async (page = 1) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : null, pending: true, error: '', notFound: false }));
    try {
      const path = details ? `/announcements/${encodeURIComponent(id)}` : `/announcements?${new URLSearchParams({ view, page: String(page) })}`;
      const data = await api(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((previous) => {
        let nextData = data;
        if (!details && page > 1 && previous.key === key && previous.data) {
          const seen = new Set();
          const announcements = [...previous.data.announcements, ...data.announcements].filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
          nextData = { ...data, announcements };
        }
        return { key, data: nextData, pending: false, error: '', notFound: false };
      });
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      if (failure.status === 401) { await onSessionExpired(); return; }
      const notFound = details && failure.status === 404;
      setState((previous) => ({ ...previous, key, data: notFound ? null : previous.data, pending: false, error: failure.message, notFound }));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [details, id, key, view, onSessionExpired]);
  useEffect(() => {
    load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);
  const current = state.key === key ? state : { data: null, pending: true, error: '', notFound: false };
  return {
    ...current, loading: current.pending && !current.data, refresh: () => load(),
    loadMore: () => load((current.data?.pagination.page || 1) + 1),
  };
}
