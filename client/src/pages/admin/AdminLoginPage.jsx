import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Phone, LockKeyhole, LogIn, ShieldCheck, ArrowRight, Waves, MapPin } from 'lucide-react';
import { validateLogin } from '@door-el-may/shared/validation';
import { FormField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { useAuth } from '../../context/AuthContext';

export function AdminLoginPage() {
  const { authenticateAdmin, connectionError, refresh } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ phone: '', password: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const change = (key) => (event) => { setValues({ ...values, [key]: event.target.value }); setFields({ ...fields, [key]: '' }); setError(''); };
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const errors = validateLogin(values);
    setFields(errors);
    if (Object.keys(errors).length) { document.getElementById(`admin-${Object.keys(errors)[0]}`)?.focus(); return; }
    pending.current = true; setBusy(true); setError('');
    try { await authenticateAdmin(values); navigate('/admin', { replace: true }); }
    catch (failure) { setError(failure.message); setFields(failure.fields || {}); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="admin-login" dir="rtl">
    <section className="admin-login-photo" aria-label="قرية تلفيت">
      <img className="admin-village" src="/images/talfit-village.jpg" alt="إطلالة على قرية تلفيت" fetchPriority="high" />
      <div className="admin-photo-brand"><Waves size={35} /><span>دور المي<small>مجلس قروي تلفيت</small></span></div>
      <div className="admin-photo-caption"><span><MapPin size={17} /> تلفيت، فلسطين</span><h2>خدمة أهل البلد،<br />بإدارة أقرب وأوضح.</h2><p>نظام توزيع المياه في قرية تلفيت</p></div>
      <small className="admin-photo-credit">talfeeti photography</small>
    </section>
    <section className="admin-login-panel">
      <Link className="admin-back" to="/login"><ArrowRight size={17} /> العودة إلى بوابة المواطنين</Link>
      <div className="admin-login-card">
        <img className="admin-login-logo" src="/images/talfit-council-logo.jpg" alt="شعار مجلس قروي تلفيت" width="78" height="78" />
        <span className="admin-eyebrow"><ShieldCheck size={16} /> بوابة مجلس قروي تلفيت</span>
        <h1>تسجيل دخول المجلس</h1>
        <p className="admin-login-subtitle">لوحة إدارة نظام دور المي – مجلس قروي تلفيت</p>
        {(error || connectionError) && <Notice onRetry={!error ? refresh : undefined}>{error || connectionError}</Notice>}
        <form noValidate onSubmit={submit} aria-label="تسجيل دخول المجلس" className="auth-form">
          <fieldset disabled={busy}>
            <FormField id="admin-phone" label="رقم الهاتف" type="tel" icon={Phone} value={values.phone} onChange={change('phone')} placeholder="05XXXXXXXX" inputMode="tel" autoComplete="username" maxLength={20} error={fields.phone} required />
            <FormField id="admin-password" label="كلمة المرور" type="password" icon={LockKeyhole} value={values.password} onChange={change('password')} placeholder="أدخل كلمة المرور" autoComplete="current-password" maxLength={128} error={fields.password} required />
            <Button type="submit" icon={LogIn} busy={busy}>تسجيل الدخول</Button>
          </fieldset>
        </form>
        <p className="admin-login-note"><LockKeyhole size={15} /> الدخول مخصص لموظفي المجلس المخوّلين</p>
      </div>
      <footer>مجلس قروي تلفيت <span>·</span> نظام دور المي</footer>
    </section>
  </main>;
}
