import { useState } from 'react';
import { Eye, EyeOff, ChevronDown, Info } from 'lucide-react';

export function FormField({ id, label, icon: Icon, type = 'text', error, hint, children, className = '', ...props }) {
  const [visible, setVisible] = useState(false);
  const password = type === 'password';
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return <div className={`field-group ${className}`}>
    <div className={`form-field ${error ? 'form-field--invalid' : ''}`}>
      <span className="field-icon"><Icon size={23} strokeWidth={1.9} aria-hidden="true" /></span>
      <div className="field-body">
        <label htmlFor={id}>{label}</label>
        <div className="field-control">
          {children ? <><select id={id} {...props} aria-invalid={!!error} aria-describedby={describedBy}>{children}</select><ChevronDown className="select-chevron" size={19} aria-hidden="true" /></>
            : <input id={id} type={password && visible ? 'text' : type} {...props} className={`${password ? 'password-input' : ''} ${type === 'tel' ? 'phone-input' : ''}`} aria-invalid={!!error} aria-describedby={describedBy} />}
          {password && <button className="password-toggle" type="button" aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-controls={id} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={21} /> : <Eye size={21} />}
          </button>}
        </div>
      </div>
    </div>
    {hint && !error && <p id={`${id}-hint`} className="field-hint"><Info size={14} aria-hidden="true" />{hint}</p>}
    {error && <p id={`${id}-error`} className="field-error" role="alert">{error}</p>}
  </div>;
}
