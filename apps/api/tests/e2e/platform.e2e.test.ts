import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataSource } from '../../src/database/data-source';
import { adminDatabaseUrl, testDatabaseUrl } from './test-env';
import { Client } from 'pg';
import { register, startApp, type TestCtx } from './harness';

let ctx: TestCtx;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx.close(); });

describe('nền tảng', () => {
  it('/health kiểm tra DB và S3', async () => {
    const res = await ctx.http.get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: true, storage: true });
  });

  it('OpenAPI/Swagger: tài liệu JSON liệt kê đủ nhóm endpoint chính và khai báo bearer auth', async () => {
    const res = await ctx.http.get('/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    const paths = Object.keys(res.body.paths);
    for (const p of [
      '/auth/register', '/auth/login', '/auth/refresh', '/workspaces/{workspaceId}/members',
      '/workspaces/{workspaceId}/products', '/workspaces/{workspaceId}/products/{productId}/assets',
      '/workspaces/{workspaceId}/templates', '/workspaces/{workspaceId}/contents', '/workspaces/{workspaceId}/folders',
      '/runtime/manifest', '/admin/invoices/{invoiceId}/confirm', '/admin/workspaces/{workspaceId}/credits', '/health',
    ]) expect(paths, p).toContain(p);
    expect(res.body.components.securitySchemes.bearer).toBeDefined();
    expect((await ctx.http.get('/docs')).status).toBe(200);
  });

  it('thông báo lỗi i18n: mặc định vi, en theo Accept-Language, q-value, ngôn ngữ lạ rơi về vi', async () => {
    const call = (lang?: string) => {
      const r = ctx.http.post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' });
      return lang ? r.set('Accept-Language', lang) : r;
    };
    expect((await call()).body.message).toBe('Email hoặc mật khẩu không đúng');
    expect((await call('en')).body.message).toBe('Incorrect email or password');
    expect((await call('fr;q=0.9, en;q=0.8')).body.message).toBe('Incorrect email or password');
    expect((await call('vi-VN,vi;q=0.9,en;q=0.5')).body.message).toBe('Email hoặc mật khẩu không đúng');
    expect((await call('de')).body.message).toBe('Email hoặc mật khẩu không đúng');
    expect((await call('en')).body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('lỗi không lường trước không rò rỉ chi tiết nội bộ; route lạ -> 404 có cấu trúc', async () => {
    const res = await ctx.http.get('/khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên' });
    const bad = await ctx.http.post('/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });

  it('header bảo mật (helmet) có mặt, không lộ X-Powered-By', async () => {
    const res = await ctx.http.get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('CORS chỉ cho origin được cấu hình', async () => {
    const cors = await startApp({ CORS_ORIGINS: 'https://app.example.com' });
    try {
      const ok = await cors.http.get('/health').set('Origin', 'https://app.example.com');
      expect(ok.headers['access-control-allow-origin']).toBe('https://app.example.com');
      const no = await cors.http.get('/health').set('Origin', 'https://evil.example.com');
      expect(no.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await cors.close();
    }
  });

  it('rate limit: đăng nhập sai quá 10 lần/phút bị 429 RATE_LIMITED (có thông báo vi)', async () => {
    const limited = await startApp({ RATE_LIMIT_ENABLED: 'true' });
    try {
      const statuses: number[] = [];
      let last: { body: { code: string; message: string } } | undefined;
      for (let i = 0; i < 12; i++) {
        const r = await limited.http.post('/auth/login').send({ email: 'brute@example.com', password: 'guess-guess' });
        statuses.push(r.status);
        last = r;
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      expect(last!.body).toMatchObject({ code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau' });
      // endpoint thường vẫn dùng hạn mức chung cao hơn, /health không bị giới hạn
      expect((await limited.http.get('/health')).status).toBe(200);
    } finally {
      await limited.close();
    }
  });

  it('DEFAULT_LOCALE=en đổi ngôn ngữ mặc định', async () => {
    const en = await startApp({ DEFAULT_LOCALE: 'en' });
    try {
      const r = await en.http.post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' });
      expect(r.body.message).toBe('Incorrect email or password');
    } finally {
      await en.close();
    }
  });

  it('người dùng đăng nhập được dùng API sau khi mật khẩu đúng (smoke toàn luồng)', async () => {
    const s = await register(ctx, { workspaceName: 'Smoke' });
    const login = await ctx.http.post('/auth/login').send({ email: s.email, password: s.password });
    expect(login.status).toBe(200);
    expect((await ctx.http.get('/workspaces').set('Authorization', `Bearer ${login.body.accessToken}`)).body).toHaveLength(1);
  });
});

describe('migration', () => {
  it('schema do migration tạo khớp entity (chỉ lệch GIN index tags và CHECK email viết thường được thêm tay)', async () => {
    const ds = createDataSource(testDatabaseUrl());
    await ds.initialize();
    try {
      const diff = await ds.driver.createSchemaBuilder().log();
      const queries = diff.upQueries.map((q) => q.query);
      expect(queries.sort()).toEqual(
        [`DROP INDEX "public"."ix_contents_tags"`, `ALTER TABLE "users" DROP CONSTRAINT "ck_users_email_lower"`].sort(),
      );
    } finally {
      await ds.destroy();
    }
  });

  it('migration chạy lại không lỗi và revert/up trên CSDL tạm đi hết vòng', async () => {
    const dbName = `aps_mig_${Date.now().toString(36)}`;
    const admin = new Client({ connectionString: adminDatabaseUrl() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${dbName}`);
      const u = new URL(adminDatabaseUrl());
      u.pathname = `/${dbName}`;
      const ds = createDataSource(u.toString());
      await ds.initialize();
      try {
        expect((await ds.runMigrations()).length).toBe(1);
        expect((await ds.runMigrations()).length).toBe(0);
        await ds.undoLastMigration();
        const left = await ds.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'typeorm_migrations'`);
        expect(left[0].n).toBe(0);
        expect((await ds.runMigrations()).length).toBe(1);
      } finally {
        await ds.destroy();
      }
    } finally {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
    }
  });
});
