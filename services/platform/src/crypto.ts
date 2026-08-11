import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PASSWORD_ITERATIONS = 120_000
const PASSWORD_KEY_LENGTH = 32

export function randomSecret(prefix = '') {
  return `${prefix}${randomBytes(32).toString('base64url')}`
}

export function hashSecret(value: string, pepper = '') {
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex')
}

function passwordInput(email: string, password: string, pepper: string) {
  return new TextEncoder().encode(`${pepper}:${email.toLowerCase()}:${password}`)
}

function bytesToBase64Url(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function asArrayBuffer(value: Uint8Array) {
  return Uint8Array.from(value).buffer as ArrayBuffer
}

function subtleCrypto() {
  const crypto = globalThis.crypto
  if (!crypto?.subtle || !crypto.getRandomValues) throw new Error('WEB_CRYPTO_UNAVAILABLE')
  return crypto
}

async function passwordDigest(email: string, password: string, salt: Uint8Array, iterations: number, pepper: string) {
  const crypto = subtleCrypto()
  const key = await crypto.subtle.importKey('raw', passwordInput(email, password, pepper), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: asArrayBuffer(salt), iterations }, key, PASSWORD_KEY_LENGTH * 8)
  return new Uint8Array(bits)
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!
  return difference === 0
}

// Web Crypto is available in both Node and Cloudflare Workers. Keeping the
// existing encoded format makes pre-cutover credentials verifiable.
export async function hashPassword(email: string, password: string, pepper = '') {
  const crypto = subtleCrypto()
  const saltBytes = crypto.getRandomValues(new Uint8Array(16))
  const salt = bytesToBase64Url(saltBytes)
  // v2 historically passed the encoded salt string into Node's PBKDF2. Keep
  // that representation so credentials created before the Worker cutover stay
  // valid, while the entropy source itself remains a 128-bit random value.
  const digest = await passwordDigest(email, password, new TextEncoder().encode(salt), PASSWORD_ITERATIONS, pepper)
  return `pbkdf2:v2:sha256:${PASSWORD_ITERATIONS}:${salt}:${bytesToBase64Url(digest)}`
}

export async function verifyPassword(email: string, password: string, encoded: string, pepper = '') {
  const parts = encoded.split(':')
  if (parts.length !== 6 || parts[0] !== 'pbkdf2' || parts[1] !== 'v2') return false
  const iterations = Number(parts[3])
  const salt = parts[4]
  const expected = parts[5]
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || !salt || !expected) return false
  try {
    const candidate = await passwordDigest(email, password, new TextEncoder().encode(salt), iterations, pepper)
    return constantTimeEqual(candidate, base64UrlToBytes(expected))
  } catch {
    return false
  }
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
