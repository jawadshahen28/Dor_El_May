import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Phone, LockKeyhole, LogIn, UserRoundPlus, Eye } from 'lucide-react';
import { validateLogin } from '@door-el-may/shared/validation';
import { AuthLayout } from '../layouts/AuthLayout';
import { FormField } from '../components/FormField';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const [values, setValues] = useState({ phone: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const { authenticate, connectionError, refresh } = useAuth();
  const navigate = useNavigate();
  const change = (key) => (event) => { setValues({ ...values, [key]: event.target.value }); setErrors({ ...errors, [key]: '' }); setError(''); };
  async function submit(event) {
    event.preventDefault();
    if (submitted.current) return;
    const validation = validateLogin(values);
    setErrors(validation);
    if (Object.keys(validation).length) { document.getElementById(Object.keys(validation)[0])?.focus(); return; }
    submitted.current = true;
    setBusy(true);
    setError('');
    try { await authenticate('login', values); navigate('/home', { replace: true }); }
    catch (failure) { setError(failure.message); setErrors(failure.fields || {}); }
    finally { submitted.current = false; setBusy(false); }
  }
  return <AuthLayout>
    <header className="form-heading"><span className="section-eyebrow">أهلًا بأهل البلد</span><h1>تسجيل الدخول</h1><p>أهلًا بك في تطبيق دور المي</p></header>
    {(error || connectionError) && <Notice onRetry={!error ? refresh : undefined}>{error || connectionError}</Notice>}
    <form noValidate onSubmit={submit} className="auth-form login-form" aria-label="تسجيل الدخول">
      <fieldset disabled={busy}>
        <FormField id="phone" label="رقم الهاتف" type="tel" icon={Phone} value={values.phone} onChange={change('phone')} placeholder="05XXXXXXXX" autoComplete="tel-national" inputMode="tel" maxLength={20} error={errors.phone} required />
        <FormField id="password" label="كلمة المرور" type="password" icon={LockKeyhole} value={values.password} onChange={change('password')} placeholder="أدخل كلمة المرور" autoComplete="current-password" maxLength={128} error={errors.password} required />
        <Button type="submit" icon={LogIn} busy={busy}>تسجيل الدخول</Button>
      </fieldset>
    </form>
    <div className="separator"><span />أو<span /></div>
    <div className="alternate-actions">
      <Button to="/register" variant="outline" icon={UserRoundPlus}>إنشاء حساب جديد</Button>
      <Button to="/guest" variant="soft" icon={Eye}>تصفح كزائر</Button>
    </div>
    <p className="login-note">كل أخبار المي، أقرب إلك <span aria-hidden="true">💧</span></p>
  </AuthLayout>;
}
