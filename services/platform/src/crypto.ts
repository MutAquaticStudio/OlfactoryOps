import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

const PASSWORD_ITERATIONS = 120_000
const PASSWORD_KEY_LENGTH = 32

export function randomSecret(prefix = '') {
  return `${prefix}${randomBytes(32).toString('base64url')}`
}

export function hashSecret(value: string, pepper = '') {
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex')
}

export function hashPassword(email: string, password: string, pepper = '') {
  const salt = randomBytes(16).toString('base64url')
  const digest = pbkdf2Sync(`${pepper}:${email.toLowerCase()}:${password}`, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, 'sha256').toString('base64url')
  return `pbkdf2:v2:sha256:${PASSWORD_ITERATIONS}:${salt}:${digest}`
}

export function verifyPassword(email: string, password: string, encoded: string, pepper = '') {
  const parts = encoded.split(':')
  if (parts.length !== 6 || parts[0] !== 'pbkdf2' || parts[1] !== 'v2') return false
  const iterations = Number(parts[3])
  const salt = parts[4]
  const expected = parts[5]
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || !salt || !expected) return false
  const candidate = pbkdf2Sync(`${pepper}:${email.toLowerCase()}:${password}`, salt, iterations, PASSWORD_KEY_LENGTH, 'sha256').toString('base64url')
  const left = Buffer.from(candidate)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function hashIp(value: string | undefined, pepper = '') {
  return value ? hashSecret(value, pepper) : undefined
}

// Invitation links are stored only as hashes. The outbox carries an encrypted
// one-time handoff so a delivery adapter can build the email without persisting
// the raw token or putting it in audit evidence.
export function sealSecret(value: string, key: string) {
  const derived = createHash('sha256').update(key).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', derived, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function openSecret(payload: string, key: string) {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = payload.split('.')
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error('SEALED_SECRET_INVALID')
  const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), Buffer.from(ivEncoded, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, 'base64url')), decipher.final()]).toString('utf8')
}
