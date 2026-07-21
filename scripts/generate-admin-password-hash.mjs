import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { stdin, stdout, stderr } from 'node:process'

const ADMIN_EMAIL = 'admin@labofscents.org'
const ITERATIONS = 100_000
const KEY_LENGTH = 32
const SALT_BYTES = 16

try {
  const password = await readHiddenInput('New administrator password: ')
  const confirmation = await readHiddenInput('Confirm administrator password: ')
  if (password !== confirmation) {
    throw new Error('Passwords do not match')
  }
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('Password must be at least 12 characters and include letters and numbers')
  }

  const salt = randomBytes(SALT_BYTES).toString('base64url')
  const digest = pbkdf2Sync(
    `auth:v2:${ADMIN_EMAIL}:${password}`,
    salt,
    ITERATIONS,
    KEY_LENGTH,
    'sha256',
  ).toString('base64url')
  stdout.write(`pbkdf2:v1:sha256:${ITERATIONS}:${salt}:${digest}\n`)
} catch (error) {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  if (stdin.isTTY && typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(false)
  }
  stdin.pause()
}

function readHiddenInput(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal')
  }
  stderr.write(prompt)
  stdin.setEncoding('utf8')
  stdin.setRawMode(true)
  stdin.resume()

  return new Promise((resolve, reject) => {
    let value = ''
    const finish = () => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stderr.write('\n')
    }
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          finish()
          reject(new Error('Password generation cancelled'))
          return
        }
        if (character === '\r' || character === '\n') {
          finish()
          resolve(value)
          return
        }
        if (character === '\b' || character === '\u007f') {
          value = value.slice(0, -1)
          continue
        }
        if (character.charCodeAt(0) >= 32) {
          value += character
        }
      }
    }
    stdin.on('data', onData)
  })
}
