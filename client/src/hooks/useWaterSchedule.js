import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

export function useWaterSchedule(month, zone, onSessionExpired) {
  const key = `${month}:${zone}`;
  const [state, setState] = useState({ key, data: null, error: '', pending: true });
  const [zones, setZones] = useState(null);
  const [zonesError, setZonesError] = useState('');
  const [zonesAttempt, setZonesAttempt] = useState(0);
  const request = useRef(null);

  const load = useCallback(async (page = 1) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: '', pending: true }));
    try {
      const query = new URLSearchParams({ month, zone, page: String(page) });
      const data = await api(`/water-rounds?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState((previous) => ({ key, data: {
        ...data, rounds: page > 1 && previous.key === key && previous.data
          ? [...previous.data.rounds, ...data.rounds].filter((round, index, all) => all.findIndex((item) => item.id === round.id) === index)
          : data.rounds,
      }, error: '', pending: false }));
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      if (failure.status === 401) { await onSessionExpired(); return; }
      setState((previous) => ({ ...previous, key, error: failure.message, pending: false }));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [key, month, zone, onSessionExpired]);

  useEffect(() => {
    load();
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    setZonesError('');
    api('/zones', { signal: controller.signal }).then((data) => setZones(data.zones)).catch((failure) => {
      if (!controller.signal.aborted) setZonesError(failure.message);
    });
    return () => controller.abort();
  }, [zonesAttempt]);

  const current = state.key === key ? state : { data: null, error: '', pending: true };
  return {
    data: current.data, error: current.error, loading: current.pending && !current.data,
    refreshing: current.pending, refresh: () => load(),
    loadMore: () => load((current.data?.pagination.page || 1) + 1),
    zones, zonesError, retryZones: () => setZonesAttempt((attempt) => attempt + 1),
  };
}
