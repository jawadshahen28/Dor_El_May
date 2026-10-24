import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export const hashPassword = (password) => argon2.hash(password, {
  type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
});
export const verifyPassword = (hash, password) => argon2.verify(hash, password);
// Unknown phone numbers still execute Argon2 to reduce account enumeration by timing.
let dummyHash;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex'));
  return dummyHash;
}
