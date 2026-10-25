import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Notice } from '../../components/Notice';
import { formatInstant, formatNumericDate, formatScheduledTime } from '../../utils/waterDates';

export function useCouncilData(path) {
  const { refresh } = useAuth();
  const [data, setData] = useState(null), [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const request = useRef(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    try {
      const [result, neighborhoods] = await Promise.all([api(path, { signal: controller.signal }), api('/zones', { signal: controller.signal })]);
      if (!controller.signal.aborted) { setData(result); setZones(neighborhoods.zones); }
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      setData(null);
      if ([401, 403].includes(failure.status)) await refresh();
      else setError(failure.message);
    } finally { if (request.current === controller) { request.current = null; setLoading(false); } }
  }, [path, refresh]);
  useEffect(() => {
    load();
    const revisit = () => { if (document.visibilityState === 'visible') load(); };
    window.addEventListener('focus', revisit); document.addEventListener('visibilitychange', revisit);
    return () => { request.current?.abort(); request.current = null; window.removeEventListener('focus', revisit); document.removeEventListener('visibilitychange', revisit); };
  }, [load]);
  return { data, zones, loading, error, load };
}
export const actionLabels = { publish: 'نشر الدور', start: 'بدء الضخ', end: 'إنهاء الضخ', cancel: 'إلغاء الدور' };
export const statusLabels = { scheduled: 'مجدول', pumping: 'جارٍ الضخ', completed: 'مكتمل', cancelled: 'ملغى' };
export function RoundSummary({ round }) {
  return <><h3>{round.zone?.name || 'حارة غير متاحة'}</h3><p>{formatNumericDate(round.scheduledDate)} · {formatScheduledTime(round.scheduledTime)}</p></>;
}
export function RoundStatus({ round }) {
  return <span className={`admin-status ${round.status === 'pumping' ? 'admin-status--active' : round.status === 'scheduled' ? 'admin-status--scheduled' : ''}`}>{round.status === 'scheduled' && !round.publishedAt ? 'مسودة' : statusLabels[round.status]}</span>;
}
export function CouncilHeading({ title, detail, loading, load }) {
  return <div className="admin-page-heading"><div><span className="admin-eyebrow">مجلس قروي تلفيت / {title}</span><h1>{title}</h1><p>{detail}<span>التواريخ والأوقات بتوقيت فلسطين · Asia/Hebron</span></p></div><button className="admin-refresh" onClick={load} disabled={loading}><RefreshCw size={17} /><span>تحديث البيانات</span></button></div>;
}
export function CouncilState({ loading, error, load }) {
  return error ? <section className="admin-panel admin-load-error"><h2>تعذّر تحميل بيانات المجلس</h2><Notice onRetry={load}>{error}</Notice></section>
    : loading ? <div className="admin-loading" role="status">جارٍ تحميل بيانات المجلس…</div> : null;
}
export function CouncilPagination({ value, onPage, busy, label }) {
  return <div className="admin-panel-footer council-pagination" aria-label={label}><span>{value.total} دور · الصفحة {value.page}</span><div><button type="button" className="council-button" disabled={busy || value.page === 1} onClick={() => onPage(value.page - 1)}>السابق</button><button type="button" className="council-button" disabled={busy || !value.hasMore} onClick={() => onPage(value.page + 1)}>التالي</button></div></div>;
}
export function CouncilConfirm({ operation, busy, error, onConfirm, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (operation && !element.open) element.showModal();
    else if (!operation && element.open) {
      element.close();
      // A successful transition can remove its trigger button. Keep keyboard focus in the page.
      document.getElementById('admin-main')?.focus({ preventScroll: true });
    }
  }, [operation]);
  const round = operation?.round, action = operation?.action;
  const explanations = {
    publish: 'سيظهر هذا الدور رسميًا للمواطنين. النشر لا يعني بدء ضخ المياه.',
    start: 'سيُعلن بدء الضخ الفعلي الآن، وسيُسجّل وقت الخادم والمسؤول عن العملية. تحقّق من بدء الضخ على أرض الواقع.',
    end: 'سيُسجّل انتهاء الضخ الآن ويصبح الدور مكتملًا.',
    cancel: 'سيُلغى هذا الدور. إن كان منشورًا فستظهر حالته ملغاة للمواطنين.',
  };
  return <dialog ref={dialog} className="council-confirm" aria-labelledby="council-confirm-title" aria-describedby="council-confirm-description" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose}>
    {operation && <><h2 id="council-confirm-title">تأكيد {actionLabels[action]}</h2><div className="council-confirm-round"><RoundSummary round={round} /></div><p id="council-confirm-description">{explanations[action]}</p>
    {error && <Notice>{error}</Notice>}<div className="council-actions"><button type="button" className="council-button council-button--primary" disabled={busy} onClick={onConfirm}>{busy ? 'جارٍ التنفيذ…' : actionLabels[action]}</button><button type="button" className="council-button" disabled={busy} onClick={() => dialog.current.close()}>رجوع</button></div>
    </>}
  </dialog>;
}
export function LastRead({ at }) { return <div className="admin-data-note"><span>بيانات المجلس الرسمية</span><span>آخر قراءة: {formatInstant(at)} · توقيت فلسطين</span></div>; }
