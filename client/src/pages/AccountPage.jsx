import { useOutletContext } from 'react-router';
import { CalendarDays, CircleAlert, LockKeyhole, LogOut, MapPin, Phone, RefreshCw, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCitizenData } from '../hooks/useCitizenData';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { formatAnnouncementDate } from '../utils/announcementDates';

export function AccountPage() {
  const { refresh: refreshSession } = useAuth();
  const { signOut, busy } = useOutletContext();
  const { data: user, loading, pending, error, refresh } = useCitizenData('account', refreshSession);
  return <>
    <div className="workspace-intro"><h1><UserRound size={27} />حسابي</h1><p>معلومات حسابك في تطبيق دور المي</p></div>
    <div className="workspace-section-heading"><h2>المعلومات الشخصية</h2><button type="button" className="workspace-refresh" onClick={refresh} disabled={pending} aria-label="تحديث معلومات الحساب"><RefreshCw size={17} className={pending ? 'animate-spin' : ''} /></button></div>
    {error && user && <Notice onRetry={refresh}>تعذّر تحديث معلومات حسابك. المعروض من آخر تحميل ناجح. {error}</Notice>}
    {loading ? <div className="workspace-skeleton account-skeleton" role="status" aria-label="جارٍ تحميل معلومات حسابك"><div><span className="citizen-skeleton" /><span className="citizen-skeleton" /><span className="citizen-skeleton" /></div></div>
      : !user ? <div className="workspace-state" role="alert"><CircleAlert size={34} /><h2>تعذّر تحميل معلومات الحساب</h2><p>{error}</p><button type="button" onClick={refresh}>إعادة المحاولة</button></div>
        : <section className="account-profile" aria-label="بيانات حسابي"><div className="account-profile-heading"><span className="account-avatar"><UserRound size={33} strokeWidth={1.7} /></span><div><h2>{user.fullName}</h2><p>{user.zone?.name || 'الحارة غير متاحة حاليًا'}</p></div></div>
          <dl className="account-fields"><div><UserRound size={19} /><dt>الاسم الكامل</dt><dd>{user.fullName}</dd></div><div><Phone size={19} /><dt>رقم الهاتف</dt><dd><bdi dir="ltr">{user.phone}</bdi></dd></div><div><MapPin size={19} /><dt>الحارة</dt><dd>{user.zone?.name || 'الحارة غير متاحة حاليًا'}</dd></div>{user.createdAt && <div><CalendarDays size={19} /><dt>تاريخ الانضمام</dt><dd><time dateTime={user.createdAt}>{formatAnnouncementDate(user.createdAt)}</time></dd></div>}</dl>
        </section>}
    <section className="account-security" aria-labelledby="account-security-title"><h2 id="account-security-title"><LockKeyhole size={21} />الأمان</h2><div><span className="account-security-icon"><LockKeyhole size={23} /></span><div><h3>كلمة المرور</h3><p>للمساعدة في تغيير كلمة المرور، تواصل مع مجلس قروي تلفيت.</p></div></div></section>
    <Button variant="outline" icon={LogOut} onClick={signOut} busy={busy} className="account-logout" aria-label="تسجيل الخروج من الحساب">تسجيل الخروج</Button>
  </>;
}
