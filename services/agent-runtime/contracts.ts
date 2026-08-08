import { z } from 'zod'

export const toolModeSchema = z.enum(['READ_ONLY', 'MUTATING'])
export type ToolMode = z.infer<typeof toolModeSchema>

export const toolVersionSchema = z.object({ name: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/), version: z.string().regex(/^\d+\.\d+\.\d+$/) })
export type ToolVersion = z.infer<typeof toolVersionSchema>

export const toolPermissionSchema = z.object({ permissionKey: z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/), required: z.boolean() })
export type ToolPermission = z.infer<typeof toolPermissionSchema>

export const toolInputSchemaSchema = z.object({ schemaVersion: z.string().min(1).max(40), jsonSchema: z.record(z.string(), z.unknown()) })
export type ToolInputSchema = z.infer<typeof toolInputSchemaSchema>
export const toolOutputSchemaSchema = toolInputSchemaSchema
export type ToolOutputSchema = z.infer<typeof toolOutputSchemaSchema>

export const toolTimeoutSchema = z.object({ timeoutMs: z.number().int().min(100).max(120000) })
export type ToolTimeout = z.infer<typeof toolTimeoutSchema>

export const toolRetryPolicySchema = z.object({ maxAttempts: z.number().int().min(1).max(3), backoffMs: z.number().int().min(0).max(30000), retryableErrors: z.array(z.string().min(1).max(80)) })
export type ToolRetryPolicy = z.infer<typeof toolRetryPolicySchema>

export const toolConfirmationPolicySchema = z.object({ required: z.boolean(), expiresInSeconds: z.number().int().min(60).max(86400).optional() })
export type ToolConfirmationPolicy = z.infer<typeof toolConfirmationPolicySchema>

export const toolDefinitionSchema = z.object({
  tool: toolVersionSchema,
  description: z.string().trim().min(1).max(500),
  mode: toolModeSchema,
  permissions: z.array(toolPermissionSchema),
  input: toolInputSchemaSchema,
  output: toolOutputSchemaSchema,
  timeout: toolTimeoutSchema,
  retry: toolRetryPolicySchema,
  confirmation: toolConfirmationPolicySchema,
  auditEventType: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
})
export type ToolDefinition = z.infer<typeof toolDefinitionSchema>

export function validateToolDefinition(input: unknown): ToolDefinition {
  const tool = toolDefinitionSchema.parse(input)
  if (tool.mode === 'MUTATING' && tool.permissions.length === 0) throw new Error('MUTATING tools require a permission')
  if (tool.mode === 'MUTATING' && !tool.confirmation.required) throw new Error('MUTATING tools require an explicit confirmation policy')
  return tool
}
