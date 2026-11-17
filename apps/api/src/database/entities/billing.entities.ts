import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from './transformers';
import { WorkspaceEntity } from './identity.entities';

@Entity('plans')
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index('uq_plans_code', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  code: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'bigint', default: 0, transformer: bigintTransformer }) priceVnd: number;
  @Column({ type: 'integer', default: 0 }) creditsIncluded: number;
  @Column({ type: 'integer', nullable: true }) durationDays: number | null;
  @Column({ type: 'integer', nullable: true }) seatLimit: number | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const INVOICE_STATUSES = ['pending', 'paid', 'canceled'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

@Entity('invoices')
@Index('ix_invoices_workspace', ['workspaceId'])
@Check('ck_invoices_status', `"status" IN ('pending','paid','canceled')`)
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'uuid', nullable: true }) planId: string | null;
  @Column({ type: 'bigint', transformer: bigintTransformer }) amountVnd: number;
  /** Nội dung chuyển khoản khách phải ghi (đối soát thủ công). */
  @Index('uq_invoices_reference', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  reference: string;
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status: InvoiceStatus;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'timestamptz', nullable: true }) paidAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) confirmedBy: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const SUBSCRIPTION_STATUSES = ['active', 'canceled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

@Entity('subscriptions')
@Index('ix_subscriptions_workspace', ['workspaceId', 'status'])
@Check('ck_subscriptions_status', `"status" IN ('active','canceled','expired')`)
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'uuid' }) planId: string;
  @ManyToOne(() => PlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;
  @Column({ type: 'varchar', length: 16, default: 'active' }) status: SubscriptionStatus;
  @Column({ type: 'timestamptz' }) startsAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) endsAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) invoiceId: string | null;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

export const LEDGER_KINDS = ['purchase', 'grant', 'adjustment', 'usage', 'refund'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

/** Sổ cái bất biến (trigger DB chặn UPDATE/DELETE). */
@Entity('credit_ledger')
@Index('ix_credit_ledger_workspace', ['workspaceId', 'createdAt'])
@Check('ck_credit_ledger_kind', `"kind" IN ('purchase','grant','adjustment','usage','refund')`)
@Check('ck_credit_ledger_delta', '"delta" <> 0')
export class CreditLedgerEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'integer' }) delta: number;
  @Column({ type: 'integer' }) balanceAfter: number;
  @Column({ type: 'varchar', length: 16 }) kind: LedgerKind;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'uuid', nullable: true }) invoiceId: string | null;
  @Column({ type: 'uuid', nullable: true }) actorUserId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

/** Nhật ký kiểm toán bất biến: ai / khi nào / làm gì / vì sao. */
@Entity('audit_logs')
@Index('ix_audit_logs_workspace', ['workspaceId', 'createdAt'])
@Index('ix_audit_logs_entity', ['entityType', 'entityId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) actorUserId: string | null;
  @Column({ type: 'uuid', nullable: true }) workspaceId: string | null;
  @Column({ type: 'varchar', length: 64 }) action: string;
  @Column({ type: 'varchar', length: 64 }) entityType: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) entityId: string | null;
  @Column({ type: 'jsonb', nullable: true }) before: unknown;
  @Column({ type: 'jsonb', nullable: true }) after: unknown;
  @Column({ type: 'text', nullable: true }) reason: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) ip: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
