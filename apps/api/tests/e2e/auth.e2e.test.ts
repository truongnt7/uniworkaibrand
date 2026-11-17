import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startApp, uniq, type TestCtx } from './harness';

let ctx: TestCtx;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx.close(); });

describe('auth', () => {
  it('đăng ký, đăng nhập, /auth/me; email không phân biệt hoa thường', async () => {
    const email = `${uniq('Mixed')}@Example.com`;
    const reg = await ctx.http.post('/auth/register').send({ email, password: 'password-123', displayName: 'A', workspaceName: 'WS A' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe(email.toLowerCase());
    expect(reg.body.workspace.name).toBe('WS A');
    expect(reg.body.user.passwordHash).toBeUndefined();

    const login = await ctx.http.post('/auth/login').send({ email: email.toUpperCase(), password: 'password-123' });
    expect(login.status).toBe(200);
    const me = await ctx.http.get('/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email.toLowerCase());
    expect(me.body.isPlatformAdmin).toBe(false);
  });

  it('email trùng -> 409 AUTH_EMAIL_TAKEN (thông báo tiếng Việt mặc định, tiếng Anh theo Accept-Language)', async () => {
    const s = await register(ctx);
    const vi = await ctx.http.post('/auth/register').send({ email: s.email, password: 'password-123', displayName: 'B' });
    expect(vi.status).toBe(409);
    expect(vi.body).toMatchObject({ statusCode: 409, code: 'AUTH_EMAIL_TAKEN', message: 'Email này đã được đăng ký' });
    const en = await ctx.http.post('/auth/register').set('Accept-Language', 'en-US,en;q=0.9').send({ email: s.email, password: 'password-123', displayName: 'B' });
    expect(en.body.message).toBe('This email is already registered');
  });

  it('sai mật khẩu và email không tồn tại cho cùng một lỗi', async () => {
    const s = await register(ctx);
    const wrong = await ctx.http.post('/auth/login').send({ email: s.email, password: 'wrong-password' });
    const none = await ctx.http.post('/auth/login').send({ email: 'nobody@example.com', password: 'whatever-123' });
    expect(wrong.status).toBe(401);
    expect(none.status).toBe(401);
    expect(wrong.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(none.body).toEqual(wrong.body);
  });

  it('validation: mật khẩu ngắn, email sai, trường lạ -> 400 VALIDATION_FAILED có details', async () => {
    const res = await ctx.http.post('/auth/register').send({ email: 'not-an-email', password: 'short', displayName: 'X', isPlatformAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const fields = res.body.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['email', 'isPlatformAdmin', 'password']);
    expect(res.body.details.find((d: { field: string }) => d.field === 'email').message.vi).toContain('email');
  });

  it('không thể tự đặt isPlatformAdmin qua đăng ký', async () => {
    const res = await ctx.http.post('/auth/register').send({ email: `${uniq('x')}@e.com`, password: 'password-123', displayName: 'X', isPlatformAdmin: true });
    expect(res.status).toBe(400);
  });

  it('refresh xoay token; dùng lại token cũ thu hồi cả họ token', async () => {
    const s = await register(ctx);
    const r1 = await ctx.http.post('/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s.refreshToken);

    const reuse = await ctx.http.post('/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('AUTH_REFRESH_REUSED');

    const afterReuse = await ctx.http.post('/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(afterReuse.status).toBe(401);
    expect(afterReuse.body.code).toBe('AUTH_REFRESH_REUSED');
  });

  it('refresh token lạ -> AUTH_REFRESH_INVALID; logout thu hồi', async () => {
    expect((await ctx.http.post('/auth/refresh').send({ refreshToken: 'nope' })).body.code).toBe('AUTH_REFRESH_INVALID');
    const s = await register(ctx);
    expect((await ctx.http.post('/auth/logout').send({ refreshToken: s.refreshToken })).status).toBe(204);
    expect((await ctx.http.post('/auth/refresh').send({ refreshToken: s.refreshToken })).status).toBe(401);
  });

  it('refresh đồng thời với cùng một token: chỉ một yêu cầu thành công', async () => {
    const s = await register(ctx);
    const results = await Promise.all(Array.from({ length: 4 }, () => ctx.http.post('/auth/refresh').send({ refreshToken: s.refreshToken })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  });

  it('access token sai/thiếu/hết hạn -> 401', async () => {
    expect((await ctx.http.get('/auth/me')).status).toBe(401);
    expect((await ctx.http.get('/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
  });

  it('access token hết hạn bị từ chối', async () => {
    const short = await startApp({ JWT_ACCESS_TTL_SECONDS: '60' });
    try {
      const jwt = short.app.get((await import('@nestjs/jwt')).JwtService);
      const expired = await jwt.signAsync({ sub: '00000000-0000-4000-8000-000000000000', email: 'x@y.z' }, { expiresIn: -10 });
      const res = await short.http.get('/auth/me').set('Authorization', `Bearer ${expired}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    } finally {
      await short.close();
    }
  });
});
