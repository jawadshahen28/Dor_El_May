import { palestineDateTime } from '@door-el-may/shared/water-time';

const monthFormat = new Intl.DateTimeFormat('ar-PS-u-nu-latn', { timeZone: 'UTC', month: 'long', year: 'numeric' });
export const currentScheduleMonth = () => palestineDateTime().date.slice(0, 7);
export const formatScheduleMonth = (month) => monthFormat.format(new Date(`${month}-01T12:00:00Z`));
export function adjacentScheduleMonth(month, direction) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + direction, 1, 12));
  return date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 9999 ? null : date.toISOString().slice(0, 7);
}
