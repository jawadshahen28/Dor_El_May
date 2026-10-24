export const PALESTINE_TIME_ZONE = 'Asia/Hebron';

const localParts = new Intl.DateTimeFormat('en-GB-u-nu-latn', {
  timeZone: PALESTINE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function palestineDateTime(instant = new Date()) {
  const parts = Object.fromEntries(localParts.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const isLocalTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

export function nextCalendarDate(value) {
  if (!isCalendarDate(value)) return null;
  return new Date(new Date(`${value}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
}
