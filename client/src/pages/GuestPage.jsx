import { CalendarDays, Waves, LogIn, UserRoundPlus, Eye, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { Button } from '../components/Button';

export function GuestPage() {
  return <AppLayout action={<Link className="header-link" to="/login"><LogIn size={18} />تسجيل الدخول</Link>}>
    <div className="page-intro"><span className="small-badge"><Eye size={15} />تصفح كزائر</span><h1>أهلًا بك في دور المي</h1><p>أخبار المي في بلدنا، بمكان واحد.</p></div>
    <div className="guest-summary">
      <article className="status-card"><span className="status-icon"><Waves size={28} /></span><div className="status-card-heading"><h2>الضخ الحالي</h2><span className="quiet-badge">بانتظار الإعلان</span></div><p>لا تتوفر معلومات عن الضخ الحالي</p><span className="status-caption">تُعرض هنا المعلومات عند إعلان المجلس عنها.</span></article>
      <article className="status-card"><span className="status-icon"><CalendarDays size={27} /></span><div className="status-card-heading"><h2>دور الغد</h2><span className="quiet-badge">بانتظار الإعلان</span></div><p>لم يتم الإعلان عن دور الغد بعد</p><span className="status-caption">تابع هذه الصفحة للاطلاع على المستجدات.</span></article>
    </div>
    <section className="join-card"><div><span className="section-eyebrow">خليك أقرب</span><h2>بلدنا بتجمعنا</h2><p>أنشئ حسابًا مجانيًا، وكن جاهزًا للخدمات القادمة لأهالي تلفيت.</p></div><Button to="/register" icon={UserRoundPlus}>إنشاء حساب جديد</Button></section>
    <Link to="/login" className="back-text"><ArrowRight size={17} />العودة لتسجيل الدخول</Link>
  </AppLayout>;
}
