import type { JobStatus } from '@aps/shared';

export type JobEvent = 'start' | 'render_started' | 'encode_started' | 'finish' | 'fail' | 'cancel' | 'retry' | 'recover';

const TABLE: Record<JobStatus, Partial<Record<JobEvent, JobStatus>>> = {
  queued: { start: 'preparing', cancel: 'canceled' },
  preparing: { render_started: 'rendering', fail: 'failed', cancel: 'canceled', recover: 'queued' },
  rendering: { encode_started: 'encoding', finish: 'done', fail: 'failed', cancel: 'canceled', recover: 'queued' },
  encoding: { finish: 'done', fail: 'failed', cancel: 'canceled', recover: 'queued' },
  done: {},
  failed: { retry: 'queued' },
  canceled: { retry: 'queued' },
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: JobStatus,
    readonly event: JobEvent,
  ) {
    super(`Không thể '${event}' khi job đang '${from}'`);
  }
}

export function transition(from: JobStatus, event: JobEvent): JobStatus {
  const to = TABLE[from][event];
  if (!to) throw new InvalidTransitionError(from, event);
  return to;
}

export function canTransition(from: JobStatus, event: JobEvent): boolean {
  return TABLE[from][event] !== undefined;
}
