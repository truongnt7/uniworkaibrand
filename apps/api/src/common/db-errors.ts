import { QueryFailedError } from 'typeorm';

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  if (!(e instanceof QueryFailedError)) return false;
  const d = e.driverError as { code?: string; constraint?: string } | undefined;
  return d?.code === '23505' && (!constraint || d.constraint === constraint);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === 'string' && UUID_RE.test(s);
