import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_TYPES, REPORT_STATUSES, REPORT_DESCRIPTION_MAX, normalizeReportDescription, validateCitizenReport } from '../reports.js';

const submissionId = 'a'.repeat(32);
test('only the three report types and four stored report statuses are supported', () => {
  assert.deepEqual(REPORT_TYPES.map((type) => type.value), ['arrived', 'not_arrived', 'water_problem']);
  assert.deepEqual(Object.keys(REPORT_STATUSES), ['new', 'reviewing', 'resolved', 'closed']);
  assert.ok(validateCitizenReport({ type: 'pumping', submissionId }).type);
});
test('only a water problem requires a nonempty description', () => {
  for (const type of ['arrived', 'not_arrived']) assert.deepEqual(validateCitizenReport({ type, submissionId }), {});
  assert.ok(validateCitizenReport({ type: 'water_problem', description: ' \n ', submissionId }).description);
  assert.deepEqual(validateCitizenReport({ type: 'water_problem', description: 'تسريب', submissionId }), {});
});
test('descriptions preserve internal paragraphs and enforce the same client/server length bound', () => {
  assert.equal(normalizeReportDescription('  فقرة أولى\r\n\r\nفقرة ثانية  '), 'فقرة أولى\n\nفقرة ثانية');
  assert.deepEqual(validateCitizenReport({ type: 'arrived', description: 'م'.repeat(REPORT_DESCRIPTION_MAX), submissionId }), {});
  for (const description of ['م'.repeat(REPORT_DESCRIPTION_MAX + 1), {}, null, ['نص']]) assert.ok(validateCitizenReport({ type: 'arrived', description, submissionId }).description);
});
test('identity, zone and state cannot be supplied by the report client; retries need valid request metadata', () => {
  for (const extra of [{ userId: 'other' }, { zoneId: 'other' }, { status: 'resolved' }, { createdAt: '2026-01-01' }]) assert.ok(validateCitizenReport({ type: 'arrived', submissionId, ...extra })._form);
  for (const value of [null, [], { type: 'arrived' }, { type: 'arrived', submissionId: 'bad' }]) assert.ok(validateCitizenReport(value)._form);
});
