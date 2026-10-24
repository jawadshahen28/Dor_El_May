import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { Brand, CouncilSignature } from '../components/Brand';

export function AppLayout({ children, action }) {
  return <div className="app-page">
    <header className="app-header"><div className="app-header-inner"><Link to="/" aria-label="دور المي، الصفحة الرئيسية"><Brand compact /></Link>{action}</div></header>
    <main className="app-main">{children}</main>
    <footer className="app-footer"><CouncilSignature /><span><MapPin size={15} />تلفيت، فلسطين</span></footer>
  </div>;
}
