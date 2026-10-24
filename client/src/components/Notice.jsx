import { AlertCircle, RefreshCw } from 'lucide-react';

export function Notice({ children, onRetry, compact = false }) {
  return <div className={`notice ${compact ? 'notice--compact' : ''}`} role="alert">
    <AlertCircle size={18} aria-hidden="true" /><p>{children}</p>
    {onRetry && <button type="button" onClick={onRetry} className="retry-button" aria-label="إعادة المحاولة"><RefreshCw size={18} /></button>}
  </div>;
}
