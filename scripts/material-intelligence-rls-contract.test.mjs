import { describe, expect, it } from 'vitest'

import {
  MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES,
  MATERIAL_INTELLIGENCE_MUTABLE_TABLES,
  MATERIAL_INTELLIGENCE_TABLES,
  assertMaterialIntelligenceRlsContract,
  assertMaterialIntelligenceRuntimeGrants,
} from './material-intelligence-rls-contract.mjs'

const policy = (tableName, overrides = {}) => ({
  tableName,
  policyName: 'v2_tenant_scope',
  permissive: 'PERMISSIVE',
  roles: '{public}',
  command: 'ALL',
  usingExpression: "(organization_id = current_setting('app.organization_id'::text, true))",
  checkExpression: "(organization_id = current_setting('app.organization_id'::text, true))",
  ...overrides,
})

const rls = (tableName, overrides = {}) => ({
  tableName,
  rlsEnabled: true,
  rlsForced: true,
  ...overrides,
})

const grant = (tableName, overrides = {}) => ({
  tableName,
  canSelect: true,
  canInsert: true,
  canUpdate: MATERIAL_INTELLIGENCE_MUTABLE_TABLES.includes(tableName),
  canDelete: MATERIAL_INTELLIGENCE_MUTABLE_TABLES.includes(tableName),
  ...overrides,
})

describe('Material Intelligence RLS governance contract', () => {
  it('enumerates the complete tenant-owned table set', () => {
    expect(MATERIAL_INTELLIGENCE_TABLES).toEqual([
      'v2_chemical_entities',
      'v2_chemical_identifiers',
      'v2_material_components',
      'v2_material_intelligence_evidence',
      'v2_scientific_eligibility_decisions',
    ])
    expect(MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES).toEqual([
      'v2_material_intelligence_evidence',
      'v2_scientific_eligibility_decisions',
    ])
  })

  it('accepts only forced RLS with the canonical tenant policy on every table', () => {
    expect(() => assertMaterialIntelligenceRlsContract({
      rlsRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => rls(tableName)),
      policyRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => policy(tableName)),
    })).not.toThrow()
  })

  it('fails closed on a missing table, unforced RLS, or a noncanonical tenant expression', () => {
    expect(() => assertMaterialIntelligenceRlsContract({
      rlsRows: MATERIAL_INTELLIGENCE_TABLES.slice(1).map((tableName) => rls(tableName)),
      policyRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => policy(tableName)),
    })).toThrow('MATERIAL_INTELLIGENCE_RLS_TABLE_COVERAGE_FAILED')
    expect(() => assertMaterialIntelligenceRlsContract({
      rlsRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => rls(tableName, tableName === MATERIAL_INTELLIGENCE_TABLES[0] ? { rlsForced: false } : {})),
      policyRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => policy(tableName)),
    })).toThrow('MATERIAL_INTELLIGENCE_FORCE_RLS_FAILED')
    expect(() => assertMaterialIntelligenceRlsContract({
      rlsRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => rls(tableName)),
      policyRows: MATERIAL_INTELLIGENCE_TABLES.map((tableName) => policy(tableName, tableName === MATERIAL_INTELLIGENCE_TABLES[0] ? { usingExpression: 'true' } : {})),
    })).toThrow('MATERIAL_INTELLIGENCE_TENANT_POLICY_FAILED')
  })

  it('allows CRUD only on mutable tables and SELECT plus INSERT on append-only tables', () => {
    expect(() => assertMaterialIntelligenceRuntimeGrants(MATERIAL_INTELLIGENCE_TABLES.map((tableName) => grant(tableName)))).not.toThrow()
    expect(() => assertMaterialIntelligenceRuntimeGrants(MATERIAL_INTELLIGENCE_TABLES.map((tableName) => grant(
      tableName,
      tableName === MATERIAL_INTELLIGENCE_APPEND_ONLY_TABLES[0] ? { canUpdate: true } : {},
    )))).toThrow('MATERIAL_INTELLIGENCE_APPEND_ONLY_GRANTS_FAILED')
  })
})
