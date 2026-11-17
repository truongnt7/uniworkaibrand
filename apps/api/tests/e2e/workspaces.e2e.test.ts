import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startApp, type TestCtx } from './harness';

let ctx: TestCtx;
beforeAll(async () => { ctx = await startApp(); });
afterAll(async () => { await ctx.close(); });

describe('workspace + thành viên + vai trò', () => {
  it('tạo workspace -> người tạo là admin; liệt kê chỉ thấy workspace của mình', async () => {
    const a = await register(ctx);
    const b = await register(ctx);
    const created = await ctx.http.post('/workspaces').set(a.auth).send({ name: 'Shop A' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Shop A', role: 'admin', creditBalance: 0 });
    expect((await ctx.http.get('/workspaces').set(a.auth)).body.map((w: { id: string }) => w.id)).toContain(created.body.id);
    expect((await ctx.http.get('/workspaces').set(b.auth)).body).toEqual([]);
  });

  it('người ngoài workspace nhận 404 (không lộ sự tồn tại)', async () => {
    const a = await register(ctx, { workspaceName: 'Private' });
    const outsider = await register(ctx);
    const res = await ctx.http.get(`/workspaces/${a.workspaceId}`).set(outsider.auth);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('WORKSPACE_NOT_FOUND');
    expect((await ctx.http.get('/workspaces/not-a-uuid').set(a.auth)).status).toBe(404);
  });

  it('admin thêm member theo email; member không được quản trị', async () => {
    const admin = await register(ctx, { workspaceName: 'Team' });
    const member = await register(ctx);
    const ws = admin.workspaceId!;

    const add = await ctx.http.post(`/workspaces/${ws}/members`).set(admin.auth).send({ email: member.email, role: 'member' });
    expect(add.status).toBe(201);
    expect((await ctx.http.post(`/workspaces/${ws}/members`).set(admin.auth).send({ email: member.email, role: 'member' })).body.code).toBe('MEMBER_ALREADY_EXISTS');
    expect((await ctx.http.post(`/workspaces/${ws}/members`).set(admin.auth).send({ email: 'ghost@example.com', role: 'member' })).body.code).toBe('MEMBER_USER_NOT_FOUND');

    expect((await ctx.http.get(`/workspaces/${ws}`).set(member.auth)).body.role).toBe('member');
    expect((await ctx.http.get(`/workspaces/${ws}/members`).set(member.auth)).body).toHaveLength(2);

    const denied = await ctx.http.post(`/workspaces/${ws}/members`).set(member.auth).send({ email: admin.email, role: 'admin' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('WORKSPACE_ADMIN_REQUIRED');
    expect((await ctx.http.patch(`/workspaces/${ws}`).set(member.auth).send({ name: 'Hacked' })).status).toBe(403);
    expect((await ctx.http.patch(`/workspaces/${ws}/members/${admin.userId}`).set(member.auth).send({ role: 'member' })).status).toBe(403);
  });

  it('không thể hạ/xóa admin cuối cùng; có admin thứ hai thì được', async () => {
    const a1 = await register(ctx, { workspaceName: 'Admins' });
    const a2 = await register(ctx);
    const ws = a1.workspaceId!;
    expect((await ctx.http.patch(`/workspaces/${ws}/members/${a1.userId}`).set(a1.auth).send({ role: 'member' })).body.code).toBe('MEMBER_LAST_ADMIN');
    expect((await ctx.http.delete(`/workspaces/${ws}/members/${a1.userId}`).set(a1.auth)).body.code).toBe('MEMBER_LAST_ADMIN');

    await ctx.http.post(`/workspaces/${ws}/members`).set(a1.auth).send({ email: a2.email, role: 'admin' });
    expect((await ctx.http.patch(`/workspaces/${ws}/members/${a1.userId}`).set(a2.auth).send({ role: 'member' })).status).toBe(200);
    expect((await ctx.http.delete(`/workspaces/${ws}/members/${a2.userId}`).set(a2.auth)).body.code).toBe('MEMBER_LAST_ADMIN');
  });

  it('hai admin cùng tự hạ quyền song song: vẫn còn ít nhất một admin', async () => {
    const a1 = await register(ctx, { workspaceName: 'Race' });
    const a2 = await register(ctx);
    const ws = a1.workspaceId!;
    await ctx.http.post(`/workspaces/${ws}/members`).set(a1.auth).send({ email: a2.email, role: 'admin' });
    const [r1, r2] = await Promise.all([
      ctx.http.patch(`/workspaces/${ws}/members/${a1.userId}`).set(a1.auth).send({ role: 'member' }),
      ctx.http.patch(`/workspaces/${ws}/members/${a2.userId}`).set(a2.auth).send({ role: 'member' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409].sort());
  });

  it('member tự rời workspace; không được xóa người khác', async () => {
    const admin = await register(ctx, { workspaceName: 'Leave' });
    const m1 = await register(ctx);
    const m2 = await register(ctx);
    const ws = admin.workspaceId!;
    for (const m of [m1, m2]) await ctx.http.post(`/workspaces/${ws}/members`).set(admin.auth).send({ email: m.email, role: 'member' });
    expect((await ctx.http.delete(`/workspaces/${ws}/members/${m2.userId}`).set(m1.auth)).status).toBe(403);
    expect((await ctx.http.delete(`/workspaces/${ws}/members/${m1.userId}`).set(m1.auth)).status).toBe(204);
    expect((await ctx.http.get(`/workspaces/${ws}`).set(m1.auth)).status).toBe(404);
  });
});
