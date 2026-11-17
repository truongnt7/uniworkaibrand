import type { JobStatus } from '@aps/shared';

export type JobEvent =
  | 'start'
  | 'render_started'
  | 'encode_started'
  | 'finish'
  | 'fail'
  | 'cancel'
  | 'retry'
  | 'recover'
  | 'pause'
  | 'resume'
  | 'requeue'
  | 'escalate';

const ACTIVE: Partial<Record<JobEvent, JobStatus>> = {
  fail: 'failed',
  cancel: 'canceled',
  pause: 'paused',
  recover: 'queued',
  requeue: 'queued',
  escalate: 'needs_attention',
};

const TABLE: Record<JobStatus, Partial<Record<JobEvent, JobStatus>>> = {
  queued: { start: 'preparing', cancel: 'canceled', pause: 'paused', escalate: 'needs_attention' },
  preparing: { ...ACTIVE, render_started: 'rendering' },
  rendering: { ...ACTIVE, encode_started: 'encoding', finish: 'done' },
  encoding: { ...ACTIVE, finish: 'done' },
  done: {},
  failed: { retry: 'queued' },
  canceled: { retry: 'queued' },
  paused: { resume: 'queued', cancel: 'canceled' },
  needs_attention: { retry: 'queued', cancel: 'canceled' },
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
