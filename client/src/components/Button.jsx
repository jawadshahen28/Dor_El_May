import { LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';

export function Button({ children, icon: Icon, busy = false, variant = 'primary', to, className = '', ...props }) {
  const Component = to ? Link : 'button';
  return <Component {...(to ? { to } : { type: 'button' })} {...props}
    className={`button button--${variant} ${className}`} aria-busy={busy || undefined} disabled={busy || props.disabled}>
    {busy ? <LoaderCircle className="animate-spin" size={23} aria-hidden="true" /> : Icon ? <Icon size={24} strokeWidth={2} aria-hidden="true" /> : null}
    <span>{busy ? 'يرجى الانتظار…' : children}</span>
  </Component>;
}
