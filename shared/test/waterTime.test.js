import test from 'node:test';
import assert from 'node:assert/strict';
import { palestineDateTime, isCalendarDate, isLocalTime, nextCalendarDate } from '../waterTime.js';

test('Palestine calendar and clock cross midnight independently of UTC or device timezone', () => {
  assert.deepEqual(palestineDateTime('2026-01-02T22:30:00Z'), { date: '2026-01-03', time: '00:30' });
  assert.deepEqual(palestineDateTime('2026-01-02T12:15:00Z'), { date: '2026-01-02', time: '14:15' });
});

test('scheduled date validation rejects impossible days and accepts real leap days', () => {
  for (const value of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-1-01', 'tomorrow', null]) assert.equal(isCalendarDate(value), false);
  assert.equal(isCalendarDate('2028-02-29'), true);
  assert.equal(nextCalendarDate('2026-12-31'), '2027-01-01');
  assert.equal(nextCalendarDate('2028-02-28'), '2028-02-29');
});

test('optional schedule clocks represent valid local wall times without invented defaults', () => {
  for (const value of ['00:00', '09:00', '23:59']) assert.equal(isLocalTime(value), true);
  for (const value of ['', null, '9:00', '24:00', '09:60', '09:00Z']) assert.equal(isLocalTime(value), false);
});
