import type { WorkflowStreamEvent } from '@brand-flow/common'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeStreamEvents(raw: WorkflowStreamEvent): WorkflowStreamEvent[] {
  if (raw.type === 'progress' && isRecord(raw.data) && typeof raw.data.type === 'string') {
    const inner = raw.data as unknown as WorkflowStreamEvent
    return [inner, ...normalizeStreamEvents(inner)]
  }
  return [raw]
}

export function extractStreamError(event: WorkflowStreamEvent): string | undefined {
  if (typeof event.error === 'string') return event.error
  if (isRecord(event.data) && typeof event.data.message === 'string') {
    return event.data.message
  }
  if (isRecord(event.data) && typeof event.data.errorMessage === 'string') {
    return event.data.errorMessage
  }
  return undefined
}
