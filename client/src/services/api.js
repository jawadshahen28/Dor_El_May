let csrf = null;
export const setCsrfToken = (token) => { csrf = token || null; };

export class ApiError extends Error {
  constructor(message, code, fields, status) { super(message); Object.assign(this, { code, fields, status }); }
}

export async function api(path, { method = 'GET', body, signal, retryCsrf = true } = {}) {
  const mutation = !['GET', 'HEAD'].includes(method);
  if (mutation && !csrf) {
    const state = await api('/auth/me', { signal });
    setCsrfToken(state.csrfToken);
  }
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal,
      headers: { ...(mutation ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}), Accept: 'application/json' },
      ...(mutation ? { body: JSON.stringify(body || {}) } : {}),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('تعذّر الاتصال بالخدمة. تأكد من اتصالك وحاول مجددًا.', 'NETWORK_ERROR');
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError('الخدمة غير متاحة مؤقتًا. يرجى إعادة المحاولة.', 'SERVICE_UNAVAILABLE'); }
  if (!response.ok || !payload.success) {
    if (payload.error?.code === 'CSRF_INVALID' && mutation && retryCsrf) {
      setCsrfToken(null);
      return api(path, { method, body, signal, retryCsrf: false });
    }
    throw new ApiError(payload.error?.message || 'حدث خطأ. يرجى المحاولة مجددًا.', payload.error?.code, payload.error?.fields, response.status);
  }
  if (Object.hasOwn(payload.data, 'csrfToken')) setCsrfToken(payload.data.csrfToken);
  return payload.data;
}
