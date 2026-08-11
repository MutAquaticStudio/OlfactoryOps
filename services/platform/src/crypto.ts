import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha256.js'

const PASSWORD_ITERATIONS = 120_000
const PASSWORD_KEY_LENGTH = 32

export class PasswordCryptoError extends Error {
  constructor(readonly code: 'PASSWORD_PBKDF2_FAILED') { super(code) }
}

export function randomSecret(prefix = '') {
  return `${prefix}${randomBytes(32).toString('base64url')}`
}

export function hashSecret(value: string, pepper = '') {
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex')
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

async function passwordDigest(email: string, password: string, salt: string, iterations: number, pepper: string) {
  try {
    return await pbkdf2Async(sha256, `${pepper}:${email.toLowerCase()}:${password}`, salt, { c: iterations, dkLen: PASSWORD_KEY_LENGTH, asyncTick: 2_000 })
  } catch {
    throw new PasswordCryptoError('PASSWORD_PBKDF2_FAILED')
  }
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!
  return difference === 0
}

// This RFC 2898 implementation avoids relying on provider-specific KDF shims.
// Keeping the existing encoded format makes pre-cutover credentials verifiable.
export async function hashPassword(email: string, password: string, pepper = '') {
  try {
    const salt = randomBytes(16).toString('base64url')
    const digest = await passwordDigest(email, password, salt, PASSWORD_ITERATIONS, pepper)
    return `pbkdf2:v2:sha256:${PASSWORD_ITERATIONS}:${salt}:${bytesToBase64Url(digest)}`
  } catch (error) {
    if (error instanceof PasswordCryptoError) throw error
    throw new PasswordCryptoError('PASSWORD_PBKDF2_FAILED')
  }
}

export async function verifyPassword(email: string, password: string, encoded: string, pepper = '') {
  const parts = encoded.split(':')
  if (parts.length !== 6 || parts[0] !== 'pbkdf2' || parts[1] !== 'v2') return false
  const iterations = Number(parts[3])
  const salt = parts[4]
  const expected = parts[5]
  if (!Number.isSafeInteger(iterations) || iterations < 100_000 || !salt || !expected) return false
  try {
    const candidate = await passwordDigest(email, password, salt, iterations, pepper)
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
