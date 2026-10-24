import { Link } from 'react-router';
import { ChevronLeft, MapPin, Waves } from 'lucide-react';
import { Brand, CouncilSignature } from '../components/Brand';

export function AuthLayout({ children, register = false }) {
  return <main className={`auth-page ${register ? 'auth-page--register' : 'auth-page--login'}`}>
    <div className="auth-layout">
      <section className="auth-hero" aria-label="دور المي، مجلس قروي تلفيت">
        <img className="hero-photo" src="/images/talfit-village.jpg" alt="إطلالة على قرية تلفيت" fetchPriority="high" />
        <div className="hero-shade" />
        {register && <Link to="/login" className="back-button" aria-label="العودة إلى تسجيل الدخول"><ChevronLeft size={27} /></Link>}
        <div className="hero-place"><MapPin size={14} /><span>تلفيت، فلسطين</span></div>
        <Brand />
        <div className="hero-message"><span className="hero-eyebrow"><Waves size={19} />ميّنا بتجمعنا</span><h2>أقرب لبلدك.<br />أقرب لكل قطرة.</h2><p>خطوة صغيرة، بتخلّينا أقرب.<br />معًا لخدمة أهلنا في تلفيت.</p></div>
        <div className="hero-council"><CouncilSignature /></div>
        <span className="photo-credit">talfeeti photography</span>
      </section>
      <section className="auth-panel">
        <div className="panel-content">{children}</div>
        <footer className="auth-footer">
          <img className="landscape" src="/images/village-landscape.svg" alt="" width="600" height="128" />
          <p>معًا… لخدمة أهلنا في تلفيت</p>
          <div className="mobile-council"><img src="/images/talfit-council-logo.jpg" alt="شعار مجلس قروي تلفيت" width="30" height="30" /><span>مجلس قروي تلفيت</span></div>
        </footer>
      </section>
    </div>
    <p className="desktop-footnote">دور المي <span>•</span> لأهلنا في تلفيت، بكل محبة</p>
  </main>;
}
