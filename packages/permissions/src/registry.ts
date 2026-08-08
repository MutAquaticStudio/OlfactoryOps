import { z } from 'zod'

export const V2_PERMISSION_REGISTRY_VERSION = '2.0.0'

export const permissionGroupSchema = z.enum([
  'tenant', 'security', 'members', 'materials', 'suppliers', 'inventory', 'procurement', 'formula', 'trials', 'sensory',
  'production', 'commerce', 'orders', 'costing', 'documents', 'rag', 'scientific_ai', 'sentiment', 'agent', 'billing', 'observability',
])
export type PermissionGroup = z.infer<typeof permissionGroupSchema>

export const permissionDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/),
  group: permissionGroupSchema,
  description: z.string().min(1).max(240),
  mutating: z.boolean(),
  privileged: z.boolean(),
})
export type PermissionDefinition = z.infer<typeof permissionDefinitionSchema>

const definition = (key: string, group: PermissionGroup, description: string, mutating = false, privileged = false): PermissionDefinition => ({ key, group, description, mutating, privileged })

export const V2_PERMISSION_REGISTRY = Object.freeze([
  definition('tenant.view', 'tenant', 'View the current workspace context'),
  definition('tenant.manage', 'tenant', 'Manage workspace settings', true, true),
  definition('tenant.switch', 'tenant', 'Switch between memberships'),
  definition('security.sessions.view', 'security', 'View own session metadata'),
  definition('security.sessions.revoke', 'security', 'Revoke sessions', true, true),
  definition('security.profile.view', 'security', 'View own profile settings'),
  definition('security.profile.changeEmail', 'security', 'Change and re-verify the account email', true, true),
  definition('security.profile.changePassword', 'security', 'Change the account password', true, true),
  definition('security.audit', 'security', 'View security audit evidence', false, true),
  definition('members.view', 'members', 'View workspace members'),
  definition('members.invite', 'members', 'Invite workspace members', true, true),
  definition('members.manageRoles', 'members', 'Manage membership roles', true, true),
  definition('members.remove', 'members', 'Remove a membership', true, true),
  definition('materials.view', 'materials', 'View authorized materials'),
  definition('materials.viewSensitive', 'materials', 'View sensitive material evidence'),
  definition('materials.edit', 'materials', 'Edit tenant materials', true),
  definition('materials.approve', 'materials', 'Approve material evidence', true, true),
  definition('suppliers.view', 'suppliers', 'View suppliers and offers'),
  definition('suppliers.edit', 'suppliers', 'Edit supplier profiles and offers', true),
  definition('suppliers.approve', 'suppliers', 'Approve supplier evidence', true, true),
  definition('inventory.view', 'inventory', 'View lots and stock projections'),
  definition('inventory.receive', 'inventory', 'Receive inventory into quarantine', true),
  definition('inventory.reserve', 'inventory', 'Reserve eligible lots', true),
  definition('inventory.consume', 'inventory', 'Consume inventory through a session', true, true),
  definition('inventory.adjust', 'inventory', 'Post a controlled adjustment', true, true),
  definition('inventory.transfer', 'inventory', 'Transfer a lot between controlled locations', true),
  definition('inventory.reverse', 'inventory', 'Post a compensating reversal', true, true),
  definition('procurement.view', 'procurement', 'View procurement records'),
  definition('procurement.create', 'procurement', 'Create procurement requests or orders', true),
  definition('procurement.approve', 'procurement', 'Approve purchase orders', true, true),
  definition('procurement.receive', 'procurement', 'Post a goods receipt', true),
  definition('procurement.inspect', 'procurement', 'Record receipt inspection', true),
  definition('formula.view', 'formula', 'View authorized formula records'),
  definition('formula.viewSensitive', 'formula', 'View formula composition and sensitive evidence'),
  definition('formula.edit', 'formula', 'Edit formula drafts', true),
  definition('formula.review', 'formula', 'Review formula versions', true),
  definition('formula.approve', 'formula', 'Approve a formula version', true, true),
  definition('trials.view', 'trials', 'View trials and decisions'),
  definition('trials.create', 'trials', 'Create and plan a trial', true),
  definition('trials.release', 'trials', 'Release a trial for execution', true, true),
  definition('trials.decide', 'trials', 'Close a trial decision', true, true),
  definition('sensory.view', 'sensory', 'View authorized sensory evidence'),
  definition('sensory.evaluate', 'sensory', 'Submit a sensory evaluation', true),
  definition('sensory.manage', 'sensory', 'Manage sensory sessions and panelists', true, true),
  definition('production.view', 'production', 'View production work'),
  definition('production.weigh', 'production', 'Execute production weighing', true),
  definition('production.qc', 'production', 'Record or approve QC evidence', true, true),
  definition('production.release', 'production', 'Release a finished-good lot', true, true),
  definition('commerce.view', 'commerce', 'View enabled commerce records'),
  definition('commerce.manage', 'commerce', 'Manage workspace commerce settings', true, true),
  definition('orders.view', 'orders', 'View orders and fulfillment'),
  definition('orders.create', 'orders', 'Create an order', true),
  definition('orders.reserve', 'orders', 'Reserve order inventory', true),
  definition('orders.fulfill', 'orders', 'Pack, ship, and fulfill an order', true),
  definition('costing.view', 'costing', 'View cost evidence'),
  definition('costing.viewMargin', 'costing', 'View margin evidence'),
  definition('costing.manage', 'costing', 'Manage costing policy', true, true),
  definition('documents.view', 'documents', 'View authorized documents'),
  definition('documents.manage', 'documents', 'Manage document lifecycle', true),
  definition('rag.view', 'rag', 'Retrieve authorized evidence citations'),
  definition('rag.index', 'rag', 'Index approved evidence', true, true),
  definition('rag.review', 'rag', 'Review evidence for indexing', true, true),
  definition('scientific_ai.use', 'scientific_ai', 'Use approved scientific services'),
  definition('scientific_ai.predict', 'scientific_ai', 'Request a scientific prediction'),
  definition('scientific_ai.similarity', 'scientific_ai', 'Run authorized similarity search'),
  definition('scientific_ai.explain', 'scientific_ai', 'View scientific explanations'),
  definition('scientific_ai.manage', 'scientific_ai', 'Manage tenant model and dataset registry records', true, true),
  definition('sentiment.view', 'sentiment', 'View authorized sentiment evidence'),
  definition('sentiment.viewRaw', 'sentiment', 'View raw feedback references when explicitly authorized', false, true),
  definition('sentiment.analyze', 'sentiment', 'Request sentiment analysis', true),
  definition('sentiment.manageSources', 'sentiment', 'Manage feedback sources and usage policy', true, true),
  definition('agent.execute', 'agent', 'Start an authorized agent run', true),
  definition('agent.confirmWrite', 'agent', 'Confirm a registered agent write', true, true),
  definition('agent.manageTools', 'agent', 'Manage tenant agent tool policy', true, true),
  definition('billing.view', 'billing', 'View workspace billing state'),
  definition('billing.manage', 'billing', 'Manage workspace billing', true, true),
  definition('billing.capabilities', 'billing', 'View capability and usage limits'),
  definition('domains.view', 'tenant', 'View workspace hostnames'),
  definition('domains.manage', 'tenant', 'Manage workspace hostnames', true, true),
  definition('notifications.view', 'security', 'View notification delivery state'),
  definition('notifications.manage', 'security', 'Manage notification preferences', true),
  definition('privacy.export.self', 'security', 'Request a personal data export', true),
  definition('workspace.export.request', 'tenant', 'Request a workspace export', true, true),
  definition('consent.manage', 'security', 'Manage privacy consent records', true),
  definition('observability.view', 'observability', 'View bounded workspace observability'),
] as const)

export const V2_PERMISSION_GROUPS = Object.freeze(permissionGroupSchema.options)
export const V2_PERMISSION_KEYS = Object.freeze(V2_PERMISSION_REGISTRY.map((entry) => entry.key))

export function isRegisteredPermission(value: string): value is (typeof V2_PERMISSION_KEYS)[number] {
  return V2_PERMISSION_KEYS.includes(value as (typeof V2_PERMISSION_KEYS)[number])
}

export function permissionsForGroup(group: PermissionGroup) {
  return V2_PERMISSION_REGISTRY.filter((permission) => permission.group === group)
}
