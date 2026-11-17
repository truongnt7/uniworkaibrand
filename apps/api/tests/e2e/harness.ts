import 'reflect-metadata';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../../src/bootstrap';
import { UserEntity } from '../../src/database/entities';
import { testEnv } from './test-env';

export interface TestCtx {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  ds: DataSource;
  close(): Promise<void>;
}

export async function startApp(overrides: Record<string, string> = {}): Promise<TestCtx> {
  const app = await createApp(testEnv(overrides));
  await app.init();
  const server = app.getHttpServer();
  return {
    app,
    http: request(server),
    ds: app.get(DataSource),
    close: () => app.close(),
  };
}

let counter = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export interface Session {
  userId: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

export async function register(ctx: TestCtx, opts: { workspaceName?: string; email?: string } = {}): Promise<Session & { workspaceId?: string }> {
  const email = opts.email ?? `${uniq('user')}@example.com`;
  const password = 'Sup3r-secret-pw';
  const res = await ctx.http.post('/auth/register').send({ email, password, displayName: 'Tester', workspaceName: opts.workspaceName });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    userId: res.body.user.id,
    email,
    password,
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
    workspaceId: res.body.workspace?.id,
  };
}

export async function makePlatformAdmin(ctx: TestCtx): Promise<Session> {
  const s = await register(ctx);
  await ctx.ds.getRepository(UserEntity).update({ id: s.userId }, { isPlatformAdmin: true });
  return s;
}
