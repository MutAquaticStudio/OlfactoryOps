import type { AgentActor } from './agent-context.js'

function uuid() {
  return crypto.randomUUID()
}

function now() {
  return new Date().toISOString()
}

async function auditHash(
  organizationId: string,
  sequence: number,
  previousHash: string | null,
  event: { id: string; at: string; actor: string; action: string; entity: string; request_id: string; outcome: string },
) {
  const payload = JSON.stringify(['olfactoryops.audit-chain.v1', organizationId, sequence, previousHash ?? '', event.id, event.at, event.actor, event.action, event.entity, event.request_id, event.outcome])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

async function chainAuditEvent(db: D1Database, organizationId: string, eventId: string, timestamp: string) {
  const event = await db.prepare(
    `SELECT id, at, actor, action, entity, request_id, outcome
     FROM tenant_audit_events WHERE id = ? AND organization_id = ?`,
  ).bind(eventId, organizationId).first<{ id: string; at: string; actor: string; action: string; entity: string; request_id: string; outcome: string }>()
  if (!event) return
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await db.prepare(
      `INSERT OR IGNORE INTO tenant_audit_chain_heads (organization_id, last_sequence, last_hash, updated_at)
       VALUES (?, 0, '', ?)`,
    ).bind(organizationId, timestamp).run()
    const head = await db.prepare(
      `SELECT last_sequence, last_hash FROM tenant_audit_chain_heads WHERE organization_id = ?`,
    ).bind(organizationId).first<{ last_sequence: number; last_hash: string }>()
    if (!head) return
    const sequence = head.last_sequence + 1
    const previousHash = head.last_sequence ? head.last_hash : null
    const eventHash = await auditHash(organizationId, sequence, previousHash, event)
    const update = await db.prepare(
      `UPDATE tenant_audit_chain_heads
       SET last_sequence = ?, last_hash = ?, updated_at = ?
       WHERE organization_id = ? AND last_sequence = ? AND last_hash = ?`,
    ).bind(sequence, eventHash, timestamp, organizationId, head.last_sequence, head.last_hash).run()
    if ((update.meta?.changes ?? 0) !== 1) continue
    await db.prepare(
      `UPDATE tenant_audit_events SET chain_sequence = ?, previous_hash = ?, event_hash = ?, updated_at = ?
       WHERE id = ? AND organization_id = ?`,
    ).bind(sequence, previousHash, eventHash, timestamp, event.id, organizationId).run()
    return
  }
}

export async function auditAgentEvent(db: D1Database, actor: AgentActor, action: string, entity: string, outcome = 'allowed') {
  const timestamp = now()
  const eventId = uuid()
  await db.prepare(
    `INSERT INTO tenant_audit_events (organization_id, id, at, actor, action, entity, request_id, outcome, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(organization_id, id) DO NOTHING`,
  ).bind(actor.organizationId, eventId, timestamp, actor.userId, action, entity.slice(0, 240), `agent-runtime:${eventId}`, outcome, timestamp).run()
  await chainAuditEvent(db, actor.organizationId, eventId, timestamp)
}
