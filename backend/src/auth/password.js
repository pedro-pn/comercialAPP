import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(keyLength * 2)}`;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, keyLength);
  return `${salt}:${Buffer.from(key).toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [salt, key] = String(storedHash || dummyHash).split(':');
  if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(key)) return false;
  const actual = Buffer.from(await scrypt(password, salt, keyLength));
  const expected = Buffer.from(key, 'hex');
  return timingSafeEqual(actual, expected);
}
