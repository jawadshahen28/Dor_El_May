import { ArrowRight } from 'lucide-react';
import { AppLayout } from '../layouts/AppLayout';
import { Button } from '../components/Button';

export function NotFoundPage() {
  return <AppLayout><div className="empty-page"><span className="error-number">404</span><h1>الصفحة مش هون</h1><p>يمكن تغيّر الرابط. خلّينا نرجع للبداية.</p><Button to="/" icon={ArrowRight}>العودة للرئيسية</Button></div></AppLayout>;
}
