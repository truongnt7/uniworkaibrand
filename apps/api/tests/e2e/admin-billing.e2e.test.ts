import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePlatformAdmin, register, startApp, uniq, type Session, type TestCtx } from './harness';

let ctx: TestCtx;
let admin: Session;
let customer: Session & { workspaceId?: string };
let ws: string;
beforeAll(async () => {
  ctx = await startApp();
  admin = await makePlatformAdmin(ctx);
  customer = await register(ctx, { workspaceName: 'Khách pilot' });
  ws = customer.workspaceId!;
});
afterAll(async () => { await ctx.close(); });

const mkPlan = async (over: Record<string, unknown> = {}) => {
  const res = await ctx.http.post('/admin/plans').set(admin.auth).send({ code: uniq('plan'), name: 'Pilot Cơ bản', priceVnd: 990000, creditsIncluded: 500, durationDays: 30, ...over });
  expect(res.status).toBe(201);
  return res.body as { id: string; code: string };
};

describe('phân quyền admin', () => {
  it('người dùng thường (kể cả admin workspace) nhận 403; chưa đăng nhập 401', async () => {
    for (const [method, path] of [['get', '/admin/plans'], ['get', '/admin/workspaces'], ['get', '/admin/audit-logs'], ['get', '/admin/invoices']] as const) {
      const denied = await ctx.http[method](path).set(customer.auth);
      expect(denied.status, path).toBe(403);
      expect(denied.body.code).toBe('PLATFORM_ADMIN_REQUIRED');
      expect((await ctx.http[method](path)).status).toBe(401);
    }
    const adj = await ctx.http.post(`/admin/workspaces/${ws}/credits`).set(customer.auth).send({ amount: 1000000, reason: 'tự cấp' });
    expect(adj.status).toBe(403);
    expect((await ctx.http.get(`/workspaces/${ws}/billing`).set(customer.auth)).body.creditBalance).toBe(0);
  });
});

describe('cấp credit thủ công + sổ cái + audit', () => {
  it('cộng credit -> app đọc được số dư; ledger có balance_after; audit ghi ai/khi nào/lý do', async () => {
    const res = await ctx.http.post(`/admin/workspaces/${ws}/credits`).set(admin.auth).send({ amount: 250, reason: 'Khách chuyển khoản đợt 1', kind: 'grant' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ delta: 250, balanceAfter: 250, kind: 'grant', actorUserId: admin.userId });

    const summary = await ctx.http.get(`/workspaces/${ws}/billing`).set(customer.auth);
    expect(summary.body).toMatchObject({ workspaceId: ws, creditBalance: 250, subscription: null });
    const ledger = await ctx.http.get(`/workspaces/${ws}/billing/ledger`).set(customer.auth);
    expect(ledger.body.items[0]).toMatchObject({ delta: 250, balanceAfter: 250, reason: 'Khách chuyển khoản đợt 1' });

    const audit = await ctx.http.get(`/admin/audit-logs?workspaceId=${ws}&entityType=credit_ledger`).set(admin.auth);
    expect(audit.body.items[0]).toMatchObject({ action: 'credit.adjust', actorUserId: admin.userId, reason: 'Khách chuyển khoản đợt 1', before: { balance: 0 }, after: { balance: 250, delta: 250 } });
    expect(new Date(audit.body.items[0].createdAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('trừ credit không được làm số dư âm; amount=0 và lý do rỗng bị từ chối', async () => {
    const w = await register(ctx, { workspaceName: 'Neg' });
    await ctx.http.post(`/admin/workspaces/${w.workspaceId}/credits`).set(admin.auth).send({ amount: 100, reason: 'seed' }).expect(201);
    const over = await ctx.http.post(`/admin/workspaces/${w.workspaceId}/credits`).set(admin.auth).send({ amount: -101, reason: 'trừ quá', kind: 'adjustment' });
    expect(over.status).toBe(409);
    expect(over.body).toMatchObject({ code: 'CREDIT_INSUFFICIENT', message: 'Số dư credit không đủ (hiện có 100, cần 101)' });
    expect((await ctx.http.post(`/admin/workspaces/${w.workspaceId}/credits`).set(admin.auth).send({ amount: 0, reason: 'zero' })).body.code).toBe('CREDIT_AMOUNT_ZERO');
    expect((await ctx.http.post(`/admin/workspaces/${w.workspaceId}/credits`).set(admin.auth).send({ amount: 5, reason: '' })).status).toBe(400);
    expect((await ctx.http.post(`/admin/workspaces/${w.workspaceId}/credits`).set(admin.auth).send({ amount: -40, reason: 'hoàn tác', kind: 'adjustment' })).body.balanceAfter).toBe(60);
    expect((await ctx.http.post(`/admin/workspaces/00000000-0000-4000-8000-000000000000/credits`).set(admin.auth).send({ amount: 5, reason: 'ghost' })).status).toBe(404);
  });

  it('nhiều thao tác đồng thời: số dư cuối = tổng, sổ cái liền mạch, không bao giờ âm', async () => {
    const w = await register(ctx, { workspaceName: 'Concurrent' });
    const id = w.workspaceId!;
    await ctx.http.post(`/admin/workspaces/${id}/credits`).set(admin.auth).send({ amount: 100, reason: 'seed' }).expect(201);
    const ops = [
      ...Array.from({ length: 8 }, () => ctx.http.post(`/admin/workspaces/${id}/credits`).set(admin.auth).send({ amount: -30, reason: 'đồng thời', kind: 'adjustment' })),
      ...Array.from({ length: 5 }, () => ctx.http.post(`/admin/workspaces/${id}/credits`).set(admin.auth).send({ amount: 10, reason: 'cộng', kind: 'grant' })),
    ];
    const results = await Promise.all(ops);
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok.length + rejected.length).toBe(13);
    const sum = ok.reduce((s, r) => s + r.body.delta, 100);
    const summary = await ctx.http.get(`/admin/workspaces/${id}/billing`).set(admin.auth);
    expect(summary.body.creditBalance).toBe(sum);
    expect(sum).toBeGreaterThanOrEqual(0);
    const rows = (await ctx.ds.query(`SELECT delta, balance_after FROM credit_ledger WHERE workspace_id=$1 ORDER BY created_at, id`, [id])) as Array<{ delta: number; balance_after: number }>;
    expect(Math.min(...rows.map((r) => r.balance_after))).toBeGreaterThanOrEqual(0);
    expect(rows.reduce((acc, r) => acc + r.delta, 0)).toBe(sum);
  });

  it('sổ cái và audit là bất biến ở tầng DB (trigger chặn UPDATE/DELETE)', async () => {
    await expect(ctx.ds.query(`UPDATE credit_ledger SET delta = delta + 1`)).rejects.toThrow(/append-only/);
    await expect(ctx.ds.query(`DELETE FROM credit_ledger`)).rejects.toThrow(/append-only/);
    await expect(ctx.ds.query(`UPDATE audit_logs SET action = 'x'`)).rejects.toThrow(/append-only/);
    await expect(ctx.ds.query(`DELETE FROM audit_logs`)).rejects.toThrow(/append-only/);
    await expect(ctx.ds.query(`UPDATE workspaces SET credit_balance = -1`)).rejects.toThrow(/ck_workspaces_credit_non_negative/);
  });
});

describe('hóa đơn chuyển khoản -> gói + credit', () => {
  it('tạo hóa đơn pending -> admin xác nhận: gói active, credit cộng đúng một lần, audit đầy đủ', async () => {
    const plan = await mkPlan({ creditsIncluded: 500, durationDays: 30 });
    const w = await register(ctx, { workspaceName: 'Chuyển khoản' });
    const reference = uniq('APS').toUpperCase();
    const inv = await ctx.http.post('/admin/invoices').set(admin.auth).send({ workspaceId: w.workspaceId, planId: plan.id, amountVnd: 990000, reference, note: 'VCB' });
    expect(inv.status).toBe(201);
    expect(inv.body).toMatchObject({ status: 'pending', amountVnd: 990000, reference });
    expect((await ctx.http.get(`/workspaces/${w.workspaceId}/billing`).set(w.auth)).body.creditBalance).toBe(0);

    const dup = await ctx.http.post('/admin/invoices').set(admin.auth).send({ workspaceId: w.workspaceId, amountVnd: 1, reference });
    expect(dup.body.code).toBe('INVOICE_REFERENCE_TAKEN');

    const confirm = await ctx.http.post(`/admin/invoices/${inv.body.id}/confirm`).set(admin.auth).send({ note: 'Đã nhận 990.000đ, FT123' });
    expect(confirm.status).toBe(200);
    expect(confirm.body.invoice).toMatchObject({ status: 'paid', confirmedBy: admin.userId });
    expect(confirm.body.ledger).toMatchObject({ delta: 500, balanceAfter: 500, kind: 'purchase', invoiceId: inv.body.id });
    expect(confirm.body.subscription).toMatchObject({ status: 'active', planId: plan.id, invoiceId: inv.body.id });
    const days = (new Date(confirm.body.subscription.endsAt).getTime() - new Date(confirm.body.subscription.startsAt).getTime()) / 86_400_000;
    expect(days).toBeCloseTo(30, 3);

    const summary = await ctx.http.get(`/workspaces/${w.workspaceId}/billing`).set(w.auth);
    expect(summary.body).toMatchObject({ creditBalance: 500 });
    expect(summary.body.subscription.plan).toMatchObject({ id: plan.id, creditsIncluded: 500 });

    const again = await ctx.http.post(`/admin/invoices/${inv.body.id}/confirm`).set(admin.auth).send({});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVOICE_ALREADY_CONFIRMED');
    expect((await ctx.http.get(`/workspaces/${w.workspaceId}/billing`).set(w.auth)).body.creditBalance).toBe(500);

    const audit = await ctx.http.get(`/admin/audit-logs?workspaceId=${w.workspaceId}&limit=100`).set(admin.auth);
    const actions = audit.body.items.map((a: { action: string }) => a.action).sort();
    expect(actions).toEqual(['invoice.confirm', 'invoice.create', 'subscription.activate']);
    const confirmAudit = audit.body.items.find((a: { action: string }) => a.action === 'invoice.confirm');
    expect(confirmAudit).toMatchObject({ actorUserId: admin.userId, reason: 'Đã nhận 990.000đ, FT123', before: { status: 'pending' }, after: { status: 'paid' } });
  });

  it('xác nhận đồng thời cùng một hóa đơn: chỉ cộng credit một lần', async () => {
    const plan = await mkPlan({ creditsIncluded: 200 });
    const w = await register(ctx, { workspaceName: 'Double confirm' });
    const inv = await ctx.http.post('/admin/invoices').set(admin.auth).send({ workspaceId: w.workspaceId, planId: plan.id, amountVnd: 100, reference: uniq('DBL').toUpperCase() });
    const results = await Promise.all(Array.from({ length: 5 }, () => ctx.http.post(`/admin/invoices/${inv.body.id}/confirm`).set(admin.auth).send({})));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect((await ctx.http.get(`/admin/workspaces/${w.workspaceId}/billing`).set(admin.auth)).body.creditBalance).toBe(200);
    expect(Number((await ctx.ds.query(`SELECT COUNT(*) c FROM credit_ledger WHERE invoice_id=$1`, [inv.body.id]))[0].c)).toBe(1);
  });

  it('hủy hóa đơn pending; hóa đơn đã hủy không xác nhận được; đã thanh toán không hủy được', async () => {
    const w = await register(ctx, { workspaceName: 'Cancel' });
    const mk = async () => (await ctx.http.post('/admin/invoices').set(admin.auth).send({ workspaceId: w.workspaceId, amountVnd: 10, reference: uniq('CXL').toUpperCase() })).body;
    const a = await mk();
    expect((await ctx.http.post(`/admin/invoices/${a.id}/cancel`).set(admin.auth).send({ reason: 'khách không chuyển' })).body.status).toBe('canceled');
    expect((await ctx.http.post(`/admin/invoices/${a.id}/confirm`).set(admin.auth).send({})).body.code).toBe('INVOICE_CANCELED');
    const b = await mk();
    await ctx.http.post(`/admin/invoices/${b.id}/confirm`).set(admin.auth).send({}).expect(200);
    expect((await ctx.http.post(`/admin/invoices/${b.id}/cancel`).set(admin.auth).send({ reason: 'nhầm' })).body.code).toBe('INVOICE_ALREADY_CONFIRMED');
    const list = await ctx.http.get(`/admin/invoices?workspaceId=${w.workspaceId}&status=paid`).set(admin.auth);
    expect(list.body.total).toBe(1);
  });

  it('cấp gói thủ công: gói cũ hết hiệu lực, gói mới active, credit gói được cộng (tùy chọn)', async () => {
    const w = await register(ctx, { workspaceName: 'Manual grant' });
    const p1 = await mkPlan({ creditsIncluded: 100 });
    const p2 = await mkPlan({ creditsIncluded: 1000, durationDays: undefined });
    const g1 = await ctx.http.post(`/admin/workspaces/${w.workspaceId}/subscriptions`).set(admin.auth).send({ planId: p1.id, reason: 'Dùng thử pilot' });
    expect(g1.status).toBe(201);
    expect(g1.body.ledger).toMatchObject({ delta: 100, kind: 'grant' });
    const g2 = await ctx.http.post(`/admin/workspaces/${w.workspaceId}/subscriptions`).set(admin.auth).send({ planId: p2.id, reason: 'Nâng cấp', grantPlanCredits: false });
    expect(g2.body.ledger).toBeNull();
    expect(g2.body.subscription.endsAt).toBeNull();
    const rows = await ctx.ds.query(`SELECT status FROM subscriptions WHERE workspace_id=$1 ORDER BY created_at`, [w.workspaceId]);
    expect(rows.map((r: { status: string }) => r.status)).toEqual(['expired', 'active']);
    const summary = await ctx.http.get(`/workspaces/${w.workspaceId}/billing`).set(w.auth);
    expect(summary.body).toMatchObject({ creditBalance: 100, subscription: { planId: p2.id } });
  });

  it('gói: mã trùng 409, cập nhật có audit, danh sách; workspace tìm theo tên', async () => {
    const plan = await mkPlan();
    expect((await ctx.http.post('/admin/plans').set(admin.auth).send({ code: plan.code, name: 'dup', priceVnd: 1, creditsIncluded: 1 })).body.code).toBe('PLAN_CODE_TAKEN');
    const upd = await ctx.http.patch(`/admin/plans/${plan.id}`).set(admin.auth).send({ creditsIncluded: 750, active: false });
    expect(upd.body).toMatchObject({ creditsIncluded: 750, active: false });
    const audit = await ctx.http.get(`/admin/audit-logs?entityType=plan`).set(admin.auth);
    expect(audit.body.items.some((a: { action: string; entityId: string }) => a.action === 'plan.update' && a.entityId === plan.id)).toBe(true);
    expect((await ctx.http.get('/admin/plans').set(admin.auth)).body.length).toBeGreaterThan(0);
    const found = await ctx.http.get('/admin/workspaces?q=Kh%C3%A1ch%20pilot').set(admin.auth);
    expect(found.body.items.some((x: { id: string }) => x.id === ws)).toBe(true);
  });

  it('thành viên thường xem được billing của workspace mình nhưng không phải của workspace khác', async () => {
    const outsider = await register(ctx);
    expect((await ctx.http.get(`/workspaces/${ws}/billing`).set(outsider.auth)).status).toBe(404);
    expect((await ctx.http.get(`/workspaces/${ws}/billing/ledger`).set(outsider.auth)).status).toBe(404);
  });
});
