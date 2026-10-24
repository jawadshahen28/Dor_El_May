import { PALESTINE_TIME_ZONE, palestineDateTime, isCalendarDate, isLocalTime, nextCalendarDate } from '@door-el-may/shared/water-time';

const locale = 'ar-PS-u-nu-latn';
const calendarFormat = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const weekdayFormat = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long' });
const instantFormat = new Intl.DateTimeFormat(locale, { timeZone: PALESTINE_TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const wallTimeFormat = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true });

export function formatScheduledDate(value, reference = new Date()) {
  if (!isCalendarDate(value)) return 'لم يتم تحديد التاريخ بعد';
  const today = palestineDateTime(reference).date;
  if (value === today) return 'اليوم';
  if (value === nextCalendarDate(today)) return 'غدًا';
  // This value is a Palestine calendar date, not a UTC instant to shift into the device's timezone.
  return calendarFormat.format(new Date(`${value}T12:00:00Z`));
}

export function formatScheduleDay(value, reference = new Date()) {
  if (!isCalendarDate(value)) return '';
  const today = palestineDateTime(reference).date;
  if (value === today) return 'اليوم';
  if (value === nextCalendarDate(today)) return 'غدًا';
  return weekdayFormat.format(new Date(`${value}T12:00:00Z`));
}

export const formatNumericDate = (value) => isCalendarDate(value) ? value.replaceAll('-', '/') : '';
export const formatScheduledTime = (value) => isLocalTime(value)
  ? wallTimeFormat.format(new Date(`2000-01-01T${value}:00Z`)) : 'لم يتم تحديد الساعة بعد';
export const formatInstant = (value) => value && Number.isFinite(new Date(value).getTime()) ? instantFormat.format(new Date(value)) : null;
