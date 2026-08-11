import { describe, expect, it } from 'vitest'
import { signupWriteFailureCategory } from './prisma-repository.js'

describe('Prisma platform signup diagnostics', () => {
  it('classifies PostgreSQL adapter failures without exposing the database message', () => {
    expect(signupWriteFailureCategory({ code: 'P2021' })).toBe('SCHEMA')
    expect(signupWriteFailureCategory({ meta: { code: '23514' } })).toBe('CHECK')
    expect(signupWriteFailureCategory({ cause: { code: '42501' } })).toBe('RLS')
    expect(signupWriteFailureCategory({ code: 'P2010' })).toBe('DATABASE')
  })
})
