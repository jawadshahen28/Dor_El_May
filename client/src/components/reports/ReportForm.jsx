import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Droplets, MapPin, Send, Wrench, X } from 'lucide-react';
import { REPORT_TYPES, REPORT_DESCRIPTION_MAX, normalizeReportDescription, validateCitizenReport } from '@door-el-may/shared/reports';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { Notice } from '../Notice';
import { Button } from '../Button';

export function ReportTypeIcon({ type }) {
  return <span className={`report-type-icon report-type-icon--${type}`}>{type === 'water_problem' ? <Wrench size={23} /> : <><Droplets size={25} />{type === 'arrived' ? <CheckCircle2 size={13} className="report-type-sign" /> : <CircleAlert size={13} className="report-type-sign" />}</>}</span>;
}

function submissionId() {
  // getRandomValues also works on the HTTP LAN origin, unlike randomUUID.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function ReportForm({ user, onClose, onSubmitted }) {
  const { refresh: refreshSession } = useAuth();
  const dialog = useRef(null), firstType = useRef(null), descriptionField = useRef(null), sending = useRef(false), attempt = useRef(null);
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!dialog.current.open) dialog.current.showModal(); firstType.current?.focus(); }, []);
  async function submit(event) {
    event.preventDefault();
    if (sending.current) return;
    const normalized = normalizeReportDescription(description);
    const signature = JSON.stringify([type, normalized]);
    if (attempt.current?.signature !== signature) attempt.current = { signature, id: submissionId() };
    const input = { type, description: normalized, submissionId: attempt.current.id };
    const validation = validateCitizenReport(input);
    setErrors(validation);
    setError('');
    if (Object.keys(validation).length) { (validation.type ? firstType : descriptionField).current?.focus(); return; }
    sending.current = true;
    setBusy(true);
    try {
      await api('/reports', { method: 'POST', body: input });
      onSubmitted();
    } catch (failure) {
      if (failure.status === 401) { await refreshSession(); return; }
      setErrors(failure.fields || {});
      setError(failure.message);
      if (failure.fields?.description) descriptionField.current?.focus();
    } finally { sending.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="report-compose" aria-labelledby="report-compose-title" onClose={onClose} onCancel={(event) => { if (sending.current) event.preventDefault(); }} onClick={(event) => { if (event.target === dialog.current && !sending.current) dialog.current.close(); }}>
    <button className="report-compose-close" type="button" onClick={() => dialog.current.close()} disabled={busy} aria-label="إغلاق نموذج البلاغ"><X size={20} /></button>
    <h2 id="report-compose-title">تقديم بلاغ جديد</h2><p className="report-compose-intro">اختر نوع البلاغ وأضف التفاصيل التي تساعد المجلس.</p>
    <div className="report-zone"><MapPin size={17} />الحارة: <strong>{user.zone?.name || 'الحارة غير متاحة حاليًا'}</strong></div>
    {!user.zone && <Notice>حارة حسابك غير متاحة حاليًا. تواصل مع مجلس قروي تلفيت.</Notice>}
    <form onSubmit={submit} noValidate>
      <fieldset disabled={busy || !user.zone} className="report-form-fields"><legend className="sr-only">تفاصيل البلاغ الجديد</legend>
        <fieldset className="report-type-options" aria-describedby={errors.type ? 'report-type-error' : undefined}><legend>نوع البلاغ <span aria-hidden="true">*</span></legend>
          {REPORT_TYPES.map((item, index) => <label key={item.value} className={`report-type-option${type === item.value ? ' is-selected' : ''}`}><input ref={index === 0 ? firstType : undefined} type="radio" name="report-type" value={item.value} checked={type === item.value} onChange={() => { setType(item.value); setErrors({}); }} required /><ReportTypeIcon type={item.value} /><span>{item.label}</span></label>)}
        </fieldset>
        {errors.type && <p id="report-type-error" className="workspace-field-error" role="alert">{errors.type}</p>}
        <div className="report-description"><label htmlFor="report-description">تفاصيل البلاغ <span>{type === 'water_problem' ? 'مطلوب' : 'اختياري'}</span></label><textarea ref={descriptionField} id="report-description" rows="4" maxLength={REPORT_DESCRIPTION_MAX} value={description} onChange={(event) => { setDescription(event.target.value); setErrors((previous) => ({ ...previous, description: undefined })); }} required={type === 'water_problem'} aria-invalid={Boolean(errors.description)} aria-describedby={`report-description-help${errors.description ? ' report-description-error' : ''}`} placeholder="مثال: ضعف ضخ المياه منذ الصباح أو وجود تسريب في الشبكة…" />
          <div id="report-description-help" className="report-description-help"><span>اكتب التفاصيل الفعلية للبلاغ.</span><span><bdi>{description.length}/{REPORT_DESCRIPTION_MAX}</bdi></span></div>
          {errors.description && <p id="report-description-error" className="workspace-field-error" role="alert">{errors.description}</p>}
        </div>
        {(error || errors._form) && <Notice>{error || errors._form}</Notice>}
        <Button type="submit" icon={Send} busy={busy}>إرسال البلاغ</Button>
      </fieldset>
    </form>
  </dialog>;
}
