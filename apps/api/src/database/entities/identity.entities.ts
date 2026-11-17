import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;
  @Column({ type: 'varchar', length: 255 }) passwordHash: string;
  @Column({ type: 'varchar', length: 120 }) displayName: string;
  @Column({ type: 'boolean', default: false }) isPlatformAdmin: boolean;
  @Column({ type: 'varchar', length: 8, default: 'vi' }) locale: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index('ix_refresh_tokens_user')
  @Column({ type: 'uuid' })
  userId: string;
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
  @Index('ix_refresh_tokens_family')
  @Column({ type: 'uuid' })
  familyId: string;
  @Index('uq_refresh_tokens_hash', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) userAgent: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

export const WORKSPACE_ROLES = ['admin', 'member'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

@Entity('workspaces')
@Check('ck_workspaces_credit_non_negative', '"credit_balance" >= 0')
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  /** Số dư denormalized; chỉ đổi trong transaction có khóa hàng cùng với dòng credit_ledger. */
  @Column({ type: 'integer', default: 0 }) creditBalance: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('workspace_members')
@Unique('uq_workspace_members', ['workspaceId', 'userId'])
@Check('ck_workspace_members_role', `"role" IN ('admin','member')`)
export class WorkspaceMemberEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index('ix_workspace_members_user')
  @Column({ type: 'uuid' })
  userId: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'varchar', length: 16 }) role: WorkspaceRole;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
