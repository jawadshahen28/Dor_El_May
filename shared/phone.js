import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

export function latinDigits(value) {
  return String(value ?? '').replace(/[٠-٩۰-۹]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x6f0 ? code - 0x6f0 : code - 0x660);
  });
}

// Keep one canonical local representation, regardless of the script used to type it.
// International parsing is deliberately opt-in until it is offered in the UI.
export function normalizePhone(value, { allowInternational = false } = {}) {
  if (typeof value !== 'string') return null;
  const input = latinDigits(value).trim().replace(/[\s()-]/g, '');
  let candidates;
  if (/^05\d{8}$/.test(input)) {
    candidates = ['PS', 'IL'].map((country) => parsePhoneNumberFromString(input, country));
  } else if (allowInternational && /^\+(970|972)5\d{8}$/.test(input)) {
    candidates = [parsePhoneNumberFromString(input)];
  } else return null;

  const valid = candidates.find((phone) => phone && ['PS', 'IL'].includes(phone.country)
    && phone.isValid() && phone.getType() === 'MOBILE');
  return valid ? `0${valid.nationalNumber}` : null;
}
