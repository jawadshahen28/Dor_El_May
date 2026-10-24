import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export function useCitizenData(resource, onSessionExpired) {
  const [state, setState] = useState({ data: null, pending: true, error: '' });
  const request = useRef(null);
  const load = useCallback(async (page = 1) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((previous) => ({ ...previous, pending: true, error: '' }));
    try {
      const response = await api(resource === 'account' ? '/auth/me' : `/reports/mine?page=${page}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (resource === 'account' && !response.user) { await onSessionExpired(); return; }
      setState((previous) => {
        let data = resource === 'account' ? response.user : response;
        if (resource === 'reports' && page > 1 && previous.data) {
          const seen = new Set();
          data = { ...data, reports: [...previous.data.reports, ...data.reports].filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          }) };
        }
        return { data, pending: false, error: '' };
      });
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      if (failure.status === 401) { await onSessionExpired(); return; }
      setState((previous) => ({ ...previous, pending: false, error: failure.message }));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [resource, onSessionExpired]);
  useEffect(() => {
    load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);
  return { ...state, loading: state.pending && !state.data, refresh: () => load(), loadMore: () => load((state.data?.pagination.page || 1) + 1) };
}
