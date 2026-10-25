import { useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { NotificationControls } from '../../notifications/NotificationControls';

const features = {
  notifications: { title: 'الإشعارات', icon: Bell },
};

export function HomeDialog({ feature, onClose }) {
  const dialog = useRef(null);
  const info = features[feature];
  useEffect(() => {
    if (feature && !dialog.current.open) dialog.current.showModal();
    else if (!feature && dialog.current.open) dialog.current.close();
  }, [feature]);
  const Icon = info?.icon || Bell;
  return <dialog className="citizen-dialog" ref={dialog} onClose={onClose} aria-labelledby="citizen-dialog-title" onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }}>
    {info && <><button type="button" className="citizen-dialog-close" aria-label="إغلاق" onClick={() => dialog.current.close()}><X size={20} /></button><span className="citizen-dialog-icon"><Icon size={28} /></span><h2 id="citizen-dialog-title">{info.title}</h2>
      {info.text && <><span className="citizen-dialog-badge">قريبًا في دور المي</span><p>{info.text}</p></>}
      {feature === 'notifications' && <NotificationControls />}
    </>}
  </dialog>;
}
