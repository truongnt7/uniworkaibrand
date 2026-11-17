import type { Request } from 'express';
import type { WorkspaceRole } from '../database/entities';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthedRequest extends Request {
  user: AuthUser;
  membership?: { workspaceId: string; role: WorkspaceRole };
}
