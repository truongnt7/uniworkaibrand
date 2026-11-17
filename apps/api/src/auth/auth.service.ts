import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { ENV, Env } from '../config/env';
import { AppException } from '../common/app-exception';
import { isUniqueViolation } from '../common/db-errors';
import { RefreshTokenEntity, UserEntity, WorkspaceEntity, WorkspaceMemberEntity } from '../database/entities';
import type { RegisterDto } from './auth.dto';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export const toUserView = (u: UserEntity) => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  isPlatformAdmin: u.isPlatformAdmin,
  locale: u.locale,
});

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
// Hash hợp lệ dùng để giữ thời gian xử lý đồng đều khi email không tồn tại.
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string) {
    const email = dto.email.toLowerCase();
    const passwordHash = await hash(dto.password);
    try {
      return await this.ds.transaction(async (m) => {
        const user = await m.save(UserEntity, m.create(UserEntity, { email, passwordHash, displayName: dto.displayName }));
        let workspace: WorkspaceEntity | null = null;
        if (dto.workspaceName) {
          workspace = await m.save(WorkspaceEntity, m.create(WorkspaceEntity, { name: dto.workspaceName, createdBy: user.id }));
          await m.save(WorkspaceMemberEntity, m.create(WorkspaceMemberEntity, { userId: user.id, workspaceId: workspace.id, role: 'admin' }));
        }
        const tokens = await this.issue(m, user, randomUUID(), userAgent);
        return { ...tokens, user: toUserView(user), workspace: workspace ? { id: workspace.id, name: workspace.name } : null };
      });
    } catch (e) {
      if (isUniqueViolation(e, 'uq_users_email')) throw new AppException('AUTH_EMAIL_TAKEN', 409);
      throw e;
    }
  }

  async login(emailRaw: string, password: string, userAgent?: string) {
    const user = await this.ds.getRepository(UserEntity).findOne({ where: { email: emailRaw.toLowerCase() } });
    dummyHash ??= hash('dummy-password-for-timing');
    const ok = await verify(user?.passwordHash ?? (await dummyHash), password).catch(() => false);
    if (!user || !ok) throw new AppException('AUTH_INVALID_CREDENTIALS', 401);
    const tokens = await this.ds.transaction((m) => this.issue(m, user, randomUUID(), userAgent));
    return { ...tokens, user: toUserView(user) };
  }

  /** Xoay refresh token; dùng lại token đã xoay = nghi bị đánh cắp → thu hồi cả họ token. */
  async refresh(refreshToken: string, userAgent?: string): Promise<Tokens> {
    const outcome = await this.ds.transaction(async (m) => {
      const row = await m
        .createQueryBuilder(RefreshTokenEntity, 't')
        .setLock('pessimistic_write')
        .where('t.tokenHash = :h', { h: sha256(refreshToken) })
        .getOne();
      if (!row) return { kind: 'invalid' as const };
      if (row.revokedAt) {
        await m
          .createQueryBuilder()
          .update(RefreshTokenEntity)
          .set({ revokedAt: () => 'now()' })
          .where('family_id = :f AND revoked_at IS NULL', { f: row.familyId })
          .execute();
        return { kind: 'reused' as const };
      }
      if (row.expiresAt.getTime() <= Date.now()) return { kind: 'invalid' as const };
      const user = await m.findOne(UserEntity, { where: { id: row.userId } });
      if (!user) return { kind: 'invalid' as const };
      await m.update(RefreshTokenEntity, { id: row.id }, { revokedAt: new Date() });
      return { kind: 'ok' as const, tokens: await this.issue(m, user, row.familyId, userAgent) };
    });
    if (outcome.kind === 'reused') throw new AppException('AUTH_REFRESH_REUSED', 401);
    if (outcome.kind === 'invalid') throw new AppException('AUTH_REFRESH_INVALID', 401);
    return outcome.tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    const repo = this.ds.getRepository(RefreshTokenEntity);
    const row = await repo.findOne({ where: { tokenHash: sha256(refreshToken) } });
    if (!row) return;
    await repo
      .createQueryBuilder()
      .update()
      .set({ revokedAt: () => 'now()' })
      .where('family_id = :f AND revoked_at IS NULL', { f: row.familyId })
      .execute();
  }

  async me(userId: string) {
    const user = await this.ds.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user) throw new AppException('UNAUTHORIZED', 401);
    return toUserView(user);
  }

  private async issue(m: EntityManager, user: UserEntity, familyId: string, userAgent?: string): Promise<Tokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    await m.save(
      RefreshTokenEntity,
      m.create(RefreshTokenEntity, {
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_SECONDS * 1000),
        userAgent: userAgent?.slice(0, 255) ?? null,
      }),
    );
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { accessToken, refreshToken, expiresIn: this.env.JWT_ACCESS_TTL_SECONDS, tokenType: 'Bearer' };
  }
}
