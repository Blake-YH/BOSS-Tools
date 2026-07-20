import type { AppSnapshot } from '../domain/types'

export type ContentCommand =
  | { type: 'GET_SNAPSHOT' }
  | { type: 'START' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }

export type ContentResponse =
  | { ok: true; snapshot: AppSnapshot }
  | { ok: false; message: string }

const COMMAND_TYPES = new Set<ContentCommand['type']>([
  'GET_SNAPSHOT',
  'START',
  'PAUSE',
  'RESUME',
  'STOP'
])

export const isContentCommand = (value: unknown): value is ContentCommand => {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' && COMMAND_TYPES.has(type as ContentCommand['type'])
}
