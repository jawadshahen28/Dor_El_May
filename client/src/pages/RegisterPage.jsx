import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { UserRound, Phone, MapPin, LockKeyhole, UserRoundPlus } from 'lucide-react';
import { validateRegistration } from '@door-el-may/shared/validation';
import { AuthLayout } from '../layouts/AuthLayout';
import { FormField } from '../components/FormField';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export function RegisterPage() {
  const [values, setValues] = useState({ fullName: '', phone: '', zoneId: '', password: '', confirmPassword: '' });
  const [zones, setZones] = useState([]);
  const [zoneState, setZoneState] = useState('loading');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const loadZones = async (signal) => {
    setZoneState('loading');
    try { const data = await api('/zones', { signal }); setZones(data.zones); setZoneState(data.zones.length ? 'ready' : 'empty'); }
    catch (failure) { if (failure.name !== 'AbortError') setZoneState('error'); }
  };
  useEffect(() => { const controller = new AbortController(); loadZones(controller.signal); return () => controller.abort(); }, []);
  const change = (key) => (event) => { setValues({ ...values, [key]: event.target.value }); setErrors({ ...errors, [key]: '' }); setError(''); };
  async function submit(event) {
    event.preventDefault();
    if (submitted.current) return;
    const validation = validateRegistration(values);
    setErrors(validation);
    if (Object.keys(validation).length) { document.getElementById(Object.keys(validation)[0])?.focus(); return; }
    submitted.current = true;
    setBusy(true);
    setError('');
    try { await authenticate('register', values); navigate('/home', { replace: true }); }
    catch (failure) { setError(failure.message); setErrors(failure.fields || {}); }
    finally { submitted.current = false; setBusy(false); }
  }
  return <AuthLayout register>
    <header className="form-heading"><span className="section-eyebrow">خطوة، وتصير منّا</span><h1>إنشاء حساب جديد</h1><p>أدخل معلوماتك لإنشاء الحساب</p></header>
    {error && <Notice>{error}</Notice>}
    <form noValidate onSubmit={submit} className="auth-form register-form" aria-label="إنشاء حساب جديد">
      <fieldset disabled={busy}>
        <FormField id="fullName" label="الاسم الكامل" icon={UserRound} value={values.fullName} onChange={change('fullName')} placeholder="أدخل اسمك الكامل" autoComplete="name" maxLength={100} error={errors.fullName} required />
        <FormField id="phone" label="رقم الهاتف" type="tel" icon={Phone} value={values.phone} onChange={change('phone')} placeholder="05XXXXXXXX" autoComplete="tel-national" inputMode="tel" maxLength={20} hint="يجب أن يكون 10 أرقام ويبدأ بـ 05" error={errors.phone} required />
        <div>
          <FormField id="zoneId" label="اختر حارتك" icon={MapPin} value={values.zoneId} onChange={change('zoneId')} error={errors.zoneId} disabled={zoneState !== 'ready'} required>
            <option value="">{zoneState === 'loading' ? 'جارٍ تحميل الحارات…' : 'اختر الحارة'}</option>
            {zones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name}</option>)}
          </FormField>
          {zoneState === 'error' && <Notice compact onRetry={() => loadZones()}>تعذّر تحميل الحارات. أعد المحاولة.</Notice>}
          {zoneState === 'empty' && <p className="field-hint">سيتم فتح التسجيل عند إضافة الحارات من المجلس.</p>}
        </div>
        <FormField id="password" label="كلمة المرور" type="password" icon={LockKeyhole} value={values.password} onChange={change('password')} placeholder="أدخل كلمة المرور" autoComplete="new-password" maxLength={128} hint="8 خانات على الأقل، تتضمن حرفًا إنجليزيًا ورقمًا" error={errors.password} required />
        <FormField id="confirmPassword" label="تأكيد كلمة المرور" type="password" icon={LockKeyhole} value={values.confirmPassword} onChange={change('confirmPassword')} placeholder="أعد كتابة كلمة المرور" autoComplete="new-password" maxLength={128} error={errors.confirmPassword} required />
        <Button type="submit" icon={UserRoundPlus} busy={busy} disabled={zoneState !== 'ready'}>إنشاء الحساب والدخول</Button>
      </fieldset>
    </form>
    <p className="switch-auth">عندك حساب؟ <Link to="/login">تسجيل الدخول</Link></p>
  </AuthLayout>;
}
