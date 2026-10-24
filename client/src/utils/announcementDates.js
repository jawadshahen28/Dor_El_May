import { PALESTINE_TIME_ZONE } from '@door-el-may/shared/water-time';

const options = { timeZone: PALESTINE_TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' };
const day = new Intl.DateTimeFormat('ar-PS-u-nu-latn', options);
const instant = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { ...options, hour: 'numeric', minute: '2-digit', hour12: true });
export function formatAnnouncementDate(value, withTime = false) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? (withTime ? instant : day).format(date) : 'تاريخ النشر غير متاح';
}
