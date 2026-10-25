import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Droplets, MapPin, Waves } from 'lucide-react';
import { AdminLayout } from './AdminLayout';
import { useCouncilData, CouncilHeading, CouncilState, CouncilPagination, CouncilConfirm, RoundSummary, RoundStatus, LastRead } from './CouncilWaterComponents';
import { FormField } from '../../components/FormField';
import { Notice } from '../../components/Notice';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { formatInstant, formatNumericDate, formatScheduledTime } from '../../utils/waterDates';

export function AdminWaterPage() {
  const { refresh } = useAuth();
  const [pages, setPages] = useState({ scheduledPage: 1, historyPage: 1 });
  const { data, zones, loading, error, load } = useCouncilData('/admin/water?' + new URLSearchParams(pages));
  const [selected, setSelected] = useState(''), [operation, setOperation] = useState(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [message, setMessage] = useState('');
  const pending = useRef(false);
  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFailure(''); setMessage('');
    try {
      await api(`/admin/water-rounds/${operation.round.id}/${operation.action}`, { method: 'POST', body: { revision: operation.round.revision } });
      setMessage(operation.action === 'start' ? 'بدأ الضخ وسُجّل وقت البدء الفعلي. تظهر الحالة للمواطنين عند تحديث بياناتهم.' : 'انتهى الضخ وسُجّل وقت الانتهاء الفعلي.');
      setOperation(null); setSelected(''); await load();
    } catch (error) {
      if ([401, 403].includes(error.status) && !['CSRF_INVALID', 'ORIGIN_INVALID'].includes(error.code)) await refresh();
      else setFailure(error.message);
      if (error.status === 409) { setOperation(null); await load(); }
    } finally { pending.current = false; setBusy(false); }
  }
  const selectedRound = data?.scheduledRounds.find((round) => round.id === selected);
  return <AdminLayout>
    <CouncilHeading title="إدارة الضخ" detail="سجّل بدء الضخ وانتهاءه بعد التحقق من العملية الفعلية." loading={loading || busy} load={load} />
    {failure && <Notice>{failure}</Notice>}{message && <p className="council-success" role="status">{message}</p>}
    <CouncilState error={error} loading={loading && !data} load={load} />
    {data && <>
      <section className="admin-panel council-rounds-panel" aria-labelledby="active-pumping-heading" aria-busy={loading}><div className="admin-panel-heading"><h2 id="active-pumping-heading"><Waves size={22} />الحارات التي يجري ضخ المياه لها</h2><span className="admin-count">{data.activeRounds.length}</span></div>
        {data.activeRounds.length ? <ul className="council-rounds">{data.activeRounds.map((round) => <li key={round.id} data-round-id={round.id}><div className="council-round-detail"><RoundSummary round={round} /><p>بدأ الضخ فعليًا: {formatInstant(round.actualStartedAt) || 'لم يُسجّل وقت البدء'}</p><RoundStatus round={round} /></div><button type="button" className="council-button council-button--danger" disabled={busy || loading} onClick={() => { setFailure(''); setOperation({ round, action: 'end' }); }}>إنهاء الضخ</button></li>)}</ul>
          : <div className="admin-empty"><span><Droplets size={25} /></span><strong>لا يوجد ضخ جارٍ حاليًا</strong><p>لا يبدأ الضخ تلقائيًا عند حلول الساعة المجدولة.</p></div>}
      </section>
      <section className="admin-panel council-form-panel" aria-labelledby="start-pumping-heading"><div className="admin-panel-heading"><h2 id="start-pumping-heading">بدء ضخ جديد</h2><Link className="admin-future" to="/admin/schedule">إدارة الجدول</Link></div>
        <div className="council-form"><FormField id="pumping-round" label="الدور المنشور والمجدول" icon={MapPin} value={selectedRound ? selected : ''} disabled={busy || loading} onChange={(event) => setSelected(event.target.value)}>
          <option value="">اختر دورًا منشورًا</option>{data.scheduledRounds.map((round) => <option key={round.id} value={round.id} disabled={!round.zone?.isActive}>{round.zone?.name || 'حارة غير متاحة'} · {formatNumericDate(round.scheduledDate)} · {formatScheduledTime(round.scheduledTime)}</option>)}
        </FormField><p className="council-help">يمكن تشغيل أدوار حارات متعددة. اختر الدور الصحيح ثم أكّد بدء الضخ الفعلي الآن. لا يمكن تشغيل مسودة أو دور مكتمل أو ملغى.</p>
        <button type="button" className="council-button council-button--primary" disabled={busy || loading || !selectedRound?.zone?.isActive} onClick={() => { setFailure(''); setOperation({ round: selectedRound, action: 'start' }); }}>بدء الضخ</button>
        {!data.scheduledRounds.length && <p className="council-help">لا توجد أدوار منشورة ومجدولة. أنشئ دورًا وانشره من إدارة الجدول.</p>}</div>
        <CouncilPagination value={data.pagination.scheduled} busy={busy || loading} label="صفحات الأدوار المتاحة للضخ" onPage={(scheduledPage) => { setSelected(''); setPages((current) => ({ ...current, scheduledPage })); }} />
      </section>
      <section className="admin-panel council-rounds-panel" aria-labelledby="available-zones-heading"><div className="admin-panel-heading"><h2 id="available-zones-heading">الحارات المتاحة</h2></div><ul className="council-zone-list">{zones.map((zone) => <li key={zone.id}><MapPin size={16} />{zone.name}</li>)}</ul>{!zones.length && <p className="council-help council-empty-note">لا توجد حارات نشطة مسجلة.</p>}</section>
      <section className="admin-panel council-rounds-panel" aria-labelledby="pumping-history-heading"><div className="admin-panel-heading"><h2 id="pumping-history-heading">سجل الأدوار الأخيرة</h2></div>
        {data.history.length ? <ul className="council-rounds">{data.history.map((round) => <li key={round.id}><div className="council-round-detail"><RoundSummary round={round} /><p>بدء فعلي: {formatInstant(round.actualStartedAt) || '—'}</p><p>انتهاء فعلي: {formatInstant(round.actualEndedAt) || '—'}</p>{round.cancelledAt && <p>أُلغي في: {formatInstant(round.cancelledAt)}</p>}</div><RoundStatus round={round} /></li>)}</ul> : <div className="admin-empty"><strong>لا توجد أدوار مكتملة أو ملغاة بعد</strong></div>}
        <CouncilPagination value={data.pagination.history} busy={busy || loading} label="صفحات سجل الضخ" onPage={(historyPage) => setPages((current) => ({ ...current, historyPage }))} />
      </section><LastRead at={data.generatedAt} />
    </>}
    <CouncilConfirm operation={operation} busy={busy} error={failure} onConfirm={confirm} onClose={() => { if (!pending.current) setOperation(null); }} />
  </AdminLayout>;
}
