import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, latinDigits } from '../phone.js';
import { validateLogin, validateRegistration, normalizeName } from '../validation.js';

const valid = { fullName: 'أحمد محمد', phone: '0599123456', zoneId: '507f1f77bcf86cd799439011', password: 'MySecure9!', confirmPassword: 'MySecure9!' };

test('Palestinian and Israeli local mobile numbers are validated and normalized', () => {
  for (const phone of ['0599123456', '0569123456', '0502345678', '0522345678', '0542345678', '0552345678', '0583234567']) assert.equal(normalizePhone(phone), phone);
  assert.equal(normalizePhone(' ٠٥٩٩ ١٢٣ ٤٥٦ '), '0599123456');
  assert.equal(latinDigits('۰۵۹۹۱۲۳۴۵۶'), '0599123456');
  for (const phone of ['', '059912345', '05991234567', '0499123456', '050abc4567', '0599123456ext1', {}, 599123456]) assert.equal(normalizePhone(phone), null);
});

test('international parsing is opt-in and yields the same duplicate key', () => {
  assert.equal(normalizePhone('+970599123456'), null);
  assert.equal(normalizePhone('+970599123456', { allowInternational: true }), '0599123456');
  assert.equal(normalizePhone('+972502345678', { allowInternational: true }), '0502345678');
  assert.equal(normalizePhone('+972599123456', { allowInternational: true }), '0599123456');
  assert.equal(normalizePhone('+970502345678', { allowInternational: true }), null);
  assert.equal(normalizePhone('+12025551234', { allowInternational: true }), null);
});

test('registration accepts Arabic names, trims whitespace, and enforces all field rules', () => {
  assert.deepEqual(validateRegistration(valid), {});
  assert.equal(normalizeName('  أحمد   محمد  '), 'أحمد محمد');
  assert.ok(validateRegistration({ ...valid, fullName: 'أحمد' }).fullName);
  assert.ok(validateRegistration({ ...valid, fullName: 'أحمد <script>' }).fullName);
  assert.ok(validateRegistration({ ...valid, zoneId: { $ne: null } }).zoneId);
  for (const password of ['short1', '12345678', 'abcdefgh', 'a'.repeat(129)]) assert.ok(validateRegistration({ ...valid, password }).password);
  assert.ok(validateRegistration({ ...valid, confirmPassword: 'Different9' }).confirmPassword);
  assert.ok(validateLogin({ phone: { $ne: null }, password: 123 }).phone);
  assert.ok(validateLogin({}).password);
});
