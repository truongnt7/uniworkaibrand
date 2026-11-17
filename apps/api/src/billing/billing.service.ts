import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../common/app-exception';
import { isUniqueViolation } from '../common/db-errors';
import { page } from '../common/pagination';
import {
  AuditLogEntity,
  CreditLedgerEntity,
  InvoiceEntity,
  LedgerKind,
  PlanEntity,
  SubscriptionEntity,
  WorkspaceEntity,
} from '../database/entities';

export interface Actor {
  userId: string;
  ip?: string;
}

export const planView = (p: PlanEntity) => ({
  id: p.id,
  code: p.code,
  name: p.name,
  description: p.description,
  priceVnd: p.priceVnd,
  creditsIncluded: p.creditsIncluded,
  durationDays: p.durationDays,
  seatLimit: p.seatLimit,
  active: p.active,
  createdAt: p.createdAt,
});

export const invoiceView = (i: InvoiceEntity) => ({
  id: i.id,
  workspaceId: i.workspaceId,
  planId: i.planId,
  amountVnd: i.amountVnd,
  reference: i.reference,
  status: i.status,
  note: i.note,
  paidAt: i.paidAt,
  confirmedBy: i.confirmedBy,
  createdAt: i.createdAt,
});

export const ledgerView = (l: CreditLedgerEntity) => ({
  id: l.id,
  workspaceId: l.workspaceId,
  delta: l.delta,
  balanceAfter: l.balanceAfter,
  kind: l.kind,
  reason: l.reason,
  invoiceId: l.invoiceId,
  actorUserId: l.actorUserId,
  createdAt: l.createdAt,
});

export const subscriptionView = (s: SubscriptionEntity) => ({
  id: s.id,
  workspaceId: s.workspaceId,
  planId: s.planId,
  status: s.status,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  invoiceId: s.invoiceId,
  note: s.note,
  createdAt: s.createdAt,
});

const DAY_MS = 86_400_000;

@Injectable()
export class BillingService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async audit(
    m: EntityManager,
    actor: Actor,
    entry: { action: string; entityType: string; entityId?: string; workspaceId?: string; before?: unknown; after?: unknown; reason?: string },
  ): Promise<void> {
    await m.insert(AuditLogEntity, {
      actorUserId: actor.userId,
      workspaceId: entry.workspaceId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: (entry.before ?? null) as never,
      after: (entry.after ?? null) as never,
      reason: entry.reason ?? null,
      ip: actor.ip ?? null,
    });
  }

  /**
   * Ghi một dòng sổ cái và cập nhật số dư trong cùng transaction, dưới khóa hàng workspace
   * để các thay đổi đồng thời được tuần tự hóa và số dư không bao giờ âm.
   */
  async applyCredit(
    m: EntityManager,
    p: { workspaceId: string; delta: number; kind: LedgerKind; reason: string; invoiceId?: string; actorUserId?: string },
  ): Promise<CreditLedgerEntity> {
    const w = await m.createQueryBuilder(WorkspaceEntity, 'w').setLock('pessimistic_write').where('w.id = :id', { id: p.workspaceId }).getOne();
    if (!w) throw new AppException('WORKSPACE_NOT_FOUND', 404);
    const next = w.creditBalance + p.delta;
    if (next < 0) throw new AppException('CREDIT_INSUFFICIENT', 409, { balance: w.creditBalance, required: -p.delta });
    await m.update(WorkspaceEntity, { id: w.id }, { creditBalance: next });
    return m.save(
      CreditLedgerEntity,
      m.create(CreditLedgerEntity, {
        workspaceId: w.id,
        delta: p.delta,
        balanceAfter: next,
        kind: p.kind,
        reason: p.reason,
        invoiceId: p.invoiceId ?? null,
        actorUserId: p.actorUserId ?? null,
      }),
    );
  }

  /** Dành cho AI Gateway sau này: trừ credit khi dùng dịch vụ. */
  debit(workspaceId: string, amount: number, reason: string, actorUserId?: string) {
    return this.ds.transaction((m) => this.applyCredit(m, { workspaceId, delta: -amount, kind: 'usage', reason, actorUserId }));
  }

  // ---- Plans ----
  async createPlan(actor: Actor, dto: { code: string; name: string; description?: string; priceVnd: number; creditsIncluded: number; durationDays?: number; seatLimit?: number }) {
    try {
      return await this.ds.transaction(async (m) => {
        const plan = await m.save(
          PlanEntity,
          m.create(PlanEntity, {
            code: dto.code,
            name: dto.name,
            description: dto.description ?? null,
            priceVnd: dto.priceVnd,
            creditsIncluded: dto.creditsIncluded,
            durationDays: dto.durationDays ?? null,
            seatLimit: dto.seatLimit ?? null,
          }),
        );
        await this.audit(m, actor, { action: 'plan.create', entityType: 'plan', entityId: plan.id, after: planView(plan) });
        return planView(plan);
      });
    } catch (e) {
      if (isUniqueViolation(e, 'uq_plans_code')) throw new AppException('PLAN_CODE_TAKEN', 409, { code: dto.code });
      throw e;
    }
  }

  async updatePlan(actor: Actor, id: string, dto: Partial<{ name: string; description: string; priceVnd: number; creditsIncluded: number; durationDays: number | null; seatLimit: number | null; active: boolean }>) {
    return this.ds.transaction(async (m) => {
      const plan = await m.findOne(PlanEntity, { where: { id } });
      if (!plan) throw new AppException('PLAN_NOT_FOUND', 404);
      const before = planView(plan);
      Object.assign(plan, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)));
      await m.save(PlanEntity, plan);
      await this.audit(m, actor, { action: 'plan.update', entityType: 'plan', entityId: id, before, after: planView(plan) });
      return planView(plan);
    });
  }

  async listPlans() {
    const rows = await this.ds.getRepository(PlanEntity).find({ order: { createdAt: 'ASC' } });
    return rows.map(planView);
  }

  // ---- Invoices (chuyển khoản) ----
  async createInvoice(actor: Actor, dto: { workspaceId: string; planId?: string; amountVnd: number; reference: string; note?: string }) {
    try {
      return await this.ds.transaction(async (m) => {
        if (!(await m.exists(WorkspaceEntity, { where: { id: dto.workspaceId } }))) throw new AppException('WORKSPACE_NOT_FOUND', 404);
        if (dto.planId && !(await m.exists(PlanEntity, { where: { id: dto.planId } }))) throw new AppException('PLAN_NOT_FOUND', 404);
        const inv = await m.save(
          InvoiceEntity,
          m.create(InvoiceEntity, {
            workspaceId: dto.workspaceId,
            planId: dto.planId ?? null,
            amountVnd: dto.amountVnd,
            reference: dto.reference,
            note: dto.note ?? null,
            createdBy: actor.userId,
          }),
        );
        await this.audit(m, actor, { action: 'invoice.create', entityType: 'invoice', entityId: inv.id, workspaceId: inv.workspaceId, after: invoiceView(inv) });
        return invoiceView(inv);
      });
    } catch (e) {
      if (isUniqueViolation(e, 'uq_invoices_reference')) throw new AppException('INVOICE_REFERENCE_TAKEN', 409, { reference: dto.reference });
      throw e;
    }
  }

  async listInvoices(q: { workspaceId?: string; status?: string; limit: number; offset: number }) {
    const qb = this.ds.getRepository(InvoiceEntity).createQueryBuilder('i');
    if (q.workspaceId) qb.andWhere('i.workspaceId = :w', { w: q.workspaceId });
    if (q.status) qb.andWhere('i.status = :s', { s: q.status });
    const [rows, total] = await qb.orderBy('i.createdAt', 'DESC').addOrderBy('i.id').take(q.limit).skip(q.offset).getManyAndCount();
    return page(rows.map(invoiceView), total, q);
  }

  /**
   * Admin xác nhận đã nhận tiền: hóa đơn → paid, tạo gói (nếu có), cộng credit của gói vào sổ cái,
   * ghi audit; tất cả trong một transaction và chỉ thực hiện được đúng một lần.
   */
  async confirmInvoice(actor: Actor, id: string, opts: { note?: string }) {
    return this.ds.transaction(async (m) => {
      const inv = await m.createQueryBuilder(InvoiceEntity, 'i').setLock('pessimistic_write').where('i.id = :id', { id }).getOne();
      if (!inv) throw new AppException('INVOICE_NOT_FOUND', 404);
      if (inv.status === 'paid') throw new AppException('INVOICE_ALREADY_CONFIRMED', 409);
      if (inv.status === 'canceled') throw new AppException('INVOICE_CANCELED', 409);
      const before = invoiceView(inv);
      const now = new Date();
      await m.update(InvoiceEntity, { id }, { status: 'paid', paidAt: now, confirmedBy: actor.userId, note: opts.note ?? inv.note });

      let subscription: ReturnType<typeof subscriptionView> | null = null;
      let ledger: ReturnType<typeof ledgerView> | null = null;
      if (inv.planId) {
        const plan = await m.findOne(PlanEntity, { where: { id: inv.planId } });
        if (!plan) throw new AppException('PLAN_NOT_FOUND', 404);
        subscription = await this.activateSubscription(m, actor, inv.workspaceId, plan, { invoiceId: inv.id, note: `Hóa đơn ${inv.reference}` });
        if (plan.creditsIncluded > 0) {
          ledger = ledgerView(
            await this.applyCredit(m, {
              workspaceId: inv.workspaceId,
              delta: plan.creditsIncluded,
              kind: 'purchase',
              reason: `Chuyển khoản ${inv.reference} - gói ${plan.code}`,
              invoiceId: inv.id,
              actorUserId: actor.userId,
            }),
          );
        }
      }
      const after = invoiceView((await m.findOne(InvoiceEntity, { where: { id } }))!);
      await this.audit(m, actor, { action: 'invoice.confirm', entityType: 'invoice', entityId: id, workspaceId: inv.workspaceId, before, after, reason: opts.note });
      return { invoice: after, subscription, ledger };
    });
  }

  async cancelInvoice(actor: Actor, id: string, reason: string) {
    return this.ds.transaction(async (m) => {
      const inv = await m.createQueryBuilder(InvoiceEntity, 'i').setLock('pessimistic_write').where('i.id = :id', { id }).getOne();
      if (!inv) throw new AppException('INVOICE_NOT_FOUND', 404);
      if (inv.status === 'paid') throw new AppException('INVOICE_ALREADY_CONFIRMED', 409);
      if (inv.status === 'canceled') return invoiceView(inv);
      await m.update(InvoiceEntity, { id }, { status: 'canceled' });
      const after = invoiceView({ ...inv, status: 'canceled' } as InvoiceEntity);
      await this.audit(m, actor, { action: 'invoice.cancel', entityType: 'invoice', entityId: id, workspaceId: inv.workspaceId, before: invoiceView(inv), after, reason });
      return after;
    });
  }

  // ---- Subscriptions ----
  private async activateSubscription(m: EntityManager, actor: Actor, workspaceId: string, plan: PlanEntity, extra: { invoiceId?: string; note?: string; startsAt?: Date; endsAt?: Date | null }) {
    const now = new Date();
    await m
      .createQueryBuilder()
      .update(SubscriptionEntity)
      .set({ status: 'expired', endsAt: now })
      .where(`workspace_id = :w AND status = 'active'`, { w: workspaceId })
      .execute();
    const startsAt = extra.startsAt ?? now;
    const endsAt = extra.endsAt !== undefined ? extra.endsAt : plan.durationDays ? new Date(startsAt.getTime() + plan.durationDays * DAY_MS) : null;
    const sub = await m.save(
      SubscriptionEntity,
      m.create(SubscriptionEntity, {
        workspaceId,
        planId: plan.id,
        status: 'active',
        startsAt,
        endsAt,
        invoiceId: extra.invoiceId ?? null,
        note: extra.note ?? null,
        createdBy: actor.userId,
      }),
    );
    await this.audit(m, actor, { action: 'subscription.activate', entityType: 'subscription', entityId: sub.id, workspaceId, after: subscriptionView(sub) });
    return subscriptionView(sub);
  }

  /** Cấp gói thủ công không qua hóa đơn (vd. dùng thử cho khách pilot). */
  async grantSubscription(actor: Actor, workspaceId: string, dto: { planId: string; reason: string; grantPlanCredits: boolean; endsAt?: Date }) {
    return this.ds.transaction(async (m) => {
      if (!(await m.exists(WorkspaceEntity, { where: { id: workspaceId } }))) throw new AppException('WORKSPACE_NOT_FOUND', 404);
      const plan = await m.findOne(PlanEntity, { where: { id: dto.planId } });
      if (!plan) throw new AppException('PLAN_NOT_FOUND', 404);
      const subscription = await this.activateSubscription(m, actor, workspaceId, plan, { note: dto.reason, endsAt: dto.endsAt });
      let ledger: ReturnType<typeof ledgerView> | null = null;
      if (dto.grantPlanCredits && plan.creditsIncluded > 0) {
        ledger = ledgerView(await this.applyCredit(m, { workspaceId, delta: plan.creditsIncluded, kind: 'grant', reason: `${dto.reason} (gói ${plan.code})`, actorUserId: actor.userId }));
      }
      return { subscription, ledger };
    });
  }

  /** Cộng/trừ credit thủ công; bắt buộc có lý do để lưu vết. */
  async adjustCredits(actor: Actor, workspaceId: string, dto: { amount: number; reason: string; kind: 'grant' | 'adjustment' | 'refund' }) {
    if (dto.amount === 0) throw new AppException('CREDIT_AMOUNT_ZERO', 400);
    return this.ds.transaction(async (m) => {
      const before = (await m.findOne(WorkspaceEntity, { where: { id: workspaceId } }))?.creditBalance;
      const entry = await this.applyCredit(m, { workspaceId, delta: dto.amount, kind: dto.kind, reason: dto.reason, actorUserId: actor.userId });
      await this.audit(m, actor, {
        action: 'credit.adjust',
        entityType: 'credit_ledger',
        entityId: entry.id,
        workspaceId,
        before: { balance: before },
        after: { balance: entry.balanceAfter, delta: entry.delta },
        reason: dto.reason,
      });
      return ledgerView(entry);
    });
  }

  // ---- Reads ----
  async summary(workspaceId: string) {
    const w = await this.ds.getRepository(WorkspaceEntity).findOne({ where: { id: workspaceId } });
    if (!w) throw new AppException('WORKSPACE_NOT_FOUND', 404);
    const sub = await this.ds
      .getRepository(SubscriptionEntity)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.plan', 'p')
      .where(`s.workspaceId = :workspaceId AND s.status = 'active' AND (s.endsAt IS NULL OR s.endsAt > now())`, { workspaceId })
      .orderBy('s.startsAt', 'DESC')
      .getOne();
    return {
      workspaceId,
      creditBalance: w.creditBalance,
      subscription: sub ? { ...subscriptionView(sub), plan: planView(sub.plan) } : null,
    };
  }

  async ledger(workspaceId: string, q: { limit: number; offset: number }) {
    const [rows, total] = await this.ds
      .getRepository(CreditLedgerEntity)
      .findAndCount({ where: { workspaceId }, order: { createdAt: 'DESC', id: 'DESC' }, take: q.limit, skip: q.offset });
    return page(rows.map(ledgerView), total, q);
  }

  async auditLogs(q: { workspaceId?: string; entityType?: string; limit: number; offset: number }) {
    const qb = this.ds.getRepository(AuditLogEntity).createQueryBuilder('a');
    if (q.workspaceId) qb.andWhere('a.workspaceId = :w', { w: q.workspaceId });
    if (q.entityType) qb.andWhere('a.entityType = :t', { t: q.entityType });
    const [rows, total] = await qb.orderBy('a.createdAt', 'DESC').addOrderBy('a.id').take(q.limit).skip(q.offset).getManyAndCount();
    return page(
      rows.map((a) => ({ id: a.id, actorUserId: a.actorUserId, workspaceId: a.workspaceId, action: a.action, entityType: a.entityType, entityId: a.entityId, before: a.before, after: a.after, reason: a.reason, ip: a.ip, createdAt: a.createdAt })),
      total,
      q,
    );
  }

  async listWorkspaces(q: { q?: string; limit: number; offset: number }) {
    const qb = this.ds.getRepository(WorkspaceEntity).createQueryBuilder('w');
    if (q.q) qb.andWhere('w.name ILIKE :q', { q: `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` });
    const [rows, total] = await qb.orderBy('w.createdAt', 'DESC').addOrderBy('w.id').take(q.limit).skip(q.offset).getManyAndCount();
    return page(rows.map((w) => ({ id: w.id, name: w.name, creditBalance: w.creditBalance, createdAt: w.createdAt })), total, q);
  }
}
