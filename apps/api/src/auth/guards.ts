import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppException } from '../common/app-exception';
import { isUuid } from '../common/db-errors';
import { UserEntity, WorkspaceMemberEntity } from '../database/entities';
import type { AuthedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new AppException('UNAUTHORIZED', 401);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token, { algorithms: ['HS256'] });
      req.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new AppException('UNAUTHORIZED', 401);
    }
  }
}

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.ds.getRepository(UserEntity).findOne({ where: { id: req.user.id }, select: { id: true, isPlatformAdmin: true } });
    if (!user?.isPlatformAdmin) throw new AppException('PLATFORM_ADMIN_REQUIRED', 403);
    return true;
  }
}

export const WORKSPACE_ADMIN_KEY = 'aps:workspace-admin';
/** Đánh dấu route chỉ dành cho admin workspace (member thường nhận 403). */
export const WorkspaceAdminOnly = () => SetMetadata(WORKSPACE_ADMIN_KEY, true);

/** Yêu cầu người dùng là thành viên của `:workspaceId`; người ngoài nhận 404 để không lộ sự tồn tại. */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const workspaceId: unknown = (req.params as Record<string, unknown>).workspaceId;
    if (!isUuid(workspaceId)) throw new AppException('WORKSPACE_NOT_FOUND', 404);
    const m = await this.ds.getRepository(WorkspaceMemberEntity).findOne({ where: { workspaceId, userId: req.user.id } });
    if (!m) throw new AppException('WORKSPACE_NOT_FOUND', 404);
    const adminOnly = this.reflector.getAllAndOverride<boolean>(WORKSPACE_ADMIN_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (adminOnly && m.role !== 'admin') throw new AppException('WORKSPACE_ADMIN_REQUIRED', 403);
    req.membership = { workspaceId, role: m.role };
    return true;
  }
}
