import { useRef, useState } from 'react';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';
import { palestineDateTime } from '@door-el-may/shared/water-time';
import { AdminLayout } from './AdminLayout';
import { useCouncilData, CouncilHeading, CouncilState, CouncilPagination, CouncilConfirm, RoundSummary, RoundStatus, LastRead, actionLabels } from './CouncilWaterComponents';
import { FormField } from '../../components/FormField';
import { Notice } from '../../components/Notice';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const emptyForm = () => ({ zoneId: '', scheduledDate: palestineDateTime().date, scheduledTime: '' });
export function AdminSchedulePage() {
  const { refresh } = useAuth();
  const [filters, setFilters] = useState({ month: palestineDateTime().date.slice(0, 7), zone: 'all', status: 'all', publication: 'all', page: 1 });
  const { data, zones, loading, error, load } = useCouncilData('/admin/water-rounds?' + new URLSearchParams(filters));
  const [form, setForm] = useState(emptyForm), [editing, setEditing] = useState(null), [fields, setFields] = useState({});
  const [operation, setOperation] = useState(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [message, setMessage] = useState('');
  const pending = useRef(false), creation = useRef(null), formElement = useRef(null);
  const filter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  function resetForm() { setForm(emptyForm()); setEditing(null); setFields({}); creation.current = null; }
  async function write(path, body, method = 'POST') {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setFailure(''); setMessage(''); setFields({});
    try { return await api(path, { method, body }); }
    catch (error) {
      if ([401, 403].includes(error.status) && !['CSRF_INVALID', 'ORIGIN_INVALID'].includes(error.code)) await refresh();
      else { setFailure(error.message); setFields(error.fields || {}); }
      if (error.status === 409) { setOperation(null); await load(); }
      return null;
    } finally { pending.current = false; setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    const signature = JSON.stringify(form);
    if (!creation.current || creation.current.signature !== signature) creation.current = { signature, id: crypto.randomUUID() };
    const result = await write(editing ? `/admin/water-rounds/${editing.id}` : '/admin/water-rounds', {
      ...form, scheduledTime: form.scheduledTime || null, ...(editing ? { revision: editing.revision } : { requestId: creation.current.id }),
    }, editing ? 'PATCH' : 'POST');
    if (result) {
      setMessage(editing ? 'حُفظت تعديلات الدور. لم يتغير وقت بدء الضخ الفعلي.' : 'حُفظ الدور كمسودة. راجعه ثم اختر نشر الدور ليظهر للمواطنين.');
      const month = form.scheduledDate.slice(0, 7);
      resetForm();
      if (filters.month !== month || filters.page !== 1) setFilters((current) => ({ ...current, month, page: 1 }));
      else await load();
    }
  }
  function edit(round) {
    if (busy) return;
    setEditing(round); setForm({ zoneId: round.zone?.id || '', scheduledDate: round.scheduledDate, scheduledTime: round.scheduledTime || '' });
    setFields({}); setFailure(''); setMessage('');
    formElement.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function confirm() {
    const current = operation;
    const result = await write(`/admin/water-rounds/${current.round.id}/${current.action}`, { revision: current.round.revision });
    if (result) { setOperation(null); setMessage(`تم ${actionLabels[current.action]} بنجاح.`); if (editing?.id === current.round.id) resetForm(); await load(); }
  }
  return <AdminLayout>
    <CouncilHeading title="إدارة جدول المياه" detail="أنشئ الأدوار وراجعها وانشرها رسميًا للمواطنين." loading={loading || busy} load={load} />
    {failure && <Notice>{failure}</Notice>}{message && <p className="council-success" role="status">{message}</p>}
    <CouncilState error={error} loading={loading && !data} load={load} />
    {data && <>
      <section className="admin-panel council-form-panel" aria-labelledby="round-form-heading" ref={formElement}>
        <div className="admin-panel-heading"><h2 id="round-form-heading"><CalendarDays size={21} />{editing ? 'تعديل الدور' : 'إنشاء دور مياه'}</h2><span className="admin-status">{editing?.publishedAt ? 'دور منشور' : 'مسودة'}</span></div>
        <form className="council-form" onSubmit={save} noValidate>
          <fieldset disabled={busy || loading}><legend className="sr-only">بيانات الدور</legend><div className="council-form-grid">
            <FormField id="round-zone" label="الحارة" icon={MapPin} value={form.zoneId} onChange={(event) => setForm((current) => ({ ...current, zoneId: event.target.value }))} disabled={!!editing?.publishedAt} error={fields.zoneId} required>
              <option value="">اختر الحارة</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              {editing?.zone && !zones.some((zone) => zone.id === editing.zone.id) && <option value={editing.zone.id}>{editing.zone.name} (غير نشطة)</option>}
            </FormField>
            <FormField id="round-date" label="تاريخ الدور" icon={CalendarDays} type="date" value={form.scheduledDate} min="1900-01-01" max="9999-12-31" onChange={(event) => setForm((current) => ({ ...current, scheduledDate: event.target.value }))} error={fields.scheduledDate} required />
            <FormField id="round-time" label="الساعة (اختياري)" icon={Clock3} type="time" value={form.scheduledTime} onChange={(event) => setForm((current) => ({ ...current, scheduledTime: event.target.value }))} error={fields.scheduledTime} />
          </div><p className="council-help">الساعة المجدولة لا تعني بدء الضخ. المسودات لا تظهر للمواطنين. حارة الدور المنشور لا تتغير؛ يمكن تعديل موعده ما دام مجدولًا.</p>
          <div className="council-actions"><button type="submit" className="council-button council-button--primary" disabled={!zones.length}>{busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديلات' : 'حفظ المسودة'}</button>{editing && <button type="button" className="council-button" onClick={resetForm}>إلغاء التعديل</button>}</div></fieldset>
        </form>
      </section>
      <section className="admin-panel council-rounds-panel" aria-labelledby="council-rounds-heading" aria-busy={loading}>
        <div className="admin-panel-heading"><h2 id="council-rounds-heading">الأدوار الحالية والسابقة</h2><span className="admin-count">{data.pagination.total}</span></div>
        <div className="council-filters"><div><label htmlFor="council-filter-month">الشهر</label><input id="council-filter-month" type="month" value={filters.month} min="1900-01" max="9999-12" disabled={busy} onChange={(event) => { if (event.target.value) filter('month', event.target.value); }} /></div>
          <div><label htmlFor="council-filter-zone">تصفية الحارة</label><select id="council-filter-zone" value={filters.zone} disabled={busy} onChange={(event) => filter('zone', event.target.value)}><option value="all">جميع الحارات</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></div>
          <div><label htmlFor="council-filter-status">حالة الدور</label><select id="council-filter-status" value={filters.status} disabled={busy} onChange={(event) => filter('status', event.target.value)}><option value="all">جميع الحالات</option><option value="scheduled">مجدول</option><option value="pumping">جارٍ الضخ</option><option value="completed">مكتمل</option><option value="cancelled">ملغى</option></select></div>
          <div><label htmlFor="council-filter-publication">حالة النشر</label><select id="council-filter-publication" value={filters.publication} disabled={busy} onChange={(event) => filter('publication', event.target.value)}><option value="all">جميع الأدوار</option><option value="draft">مسودات</option><option value="published">منشورة</option></select></div></div>
        {data.rounds.length ? <ul className="council-rounds">{data.rounds.map((round) => <li key={round.id} data-round-id={round.id}><div className="council-round-detail"><RoundSummary round={round} /><RoundStatus round={round} /></div>
          <div className="council-actions">{round.status === 'scheduled' && <><button type="button" className="council-button" disabled={busy || loading} onClick={() => edit(round)}>تعديل الدور</button>{!round.publishedAt && <button type="button" className="council-button council-button--primary" disabled={busy || loading || !round.zone?.isActive} onClick={() => { setFailure(''); setOperation({ round, action: 'publish' }); }}>نشر الدور</button>}<button type="button" className="council-button council-button--danger" disabled={busy || loading} onClick={() => { setFailure(''); setOperation({ round, action: 'cancel' }); }}>إلغاء الدور</button></>}</div>
        </li>)}</ul> : <div className="admin-empty"><strong>لا توجد أدوار مطابقة للتصفية</strong><p>اختر شهرًا آخر أو أنشئ مسودة جديدة.</p></div>}
        <CouncilPagination value={data.pagination} busy={busy || loading} label="صفحات الأدوار" onPage={(page) => setFilters((current) => ({ ...current, page }))} />
      </section><LastRead at={data.generatedAt} />
    </>}
    <CouncilConfirm operation={operation} busy={busy} error={failure} onConfirm={confirm} onClose={() => { if (!pending.current) setOperation(null); }} />
  </AdminLayout>;
}
