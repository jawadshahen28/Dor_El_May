import { Droplets } from 'lucide-react';

export function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand--compact' : ''}`}>
    <img className="water-mark" src="/images/water-mark.svg" alt="" width="100" height="124" />
    <div><span className="brand-name">دور المي</span><p className="brand-subtitle">مجلس قروي تلفيت</p></div>
  </div>;
}

export function CouncilSignature() {
  return <div className="council-signature">
    <img src="/images/talfit-council-logo.jpg" width="48" height="48" alt="شعار مجلس قروي تلفيت" />
    <div><span>من أهل البلد، لأهل البلد</span><strong>مجلس قروي تلفيت</strong></div>
  </div>;
}

export function LoadingScreen() {
  return <main className="loading-screen" aria-busy="true"><Brand /><div role="status" className="loading-caption"><Droplets className="animate-pulse" size={22} />جارٍ فتح دور المي…</div></main>;
}
