import { Check, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { bigintTransformer, numericTransformer } from './transformers';
import { WorkspaceEntity } from './identity.entities';

export const MODEL_STATUSES = ['none', 'generating', 'ready'] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

@Entity('products')
@Index('uq_products_workspace_sku', ['workspaceId', 'sku'], { unique: true, where: '"deleted_at" IS NULL' })
@Index('ix_products_workspace_updated', ['workspaceId', 'updatedAt'])
@Check('ck_products_model_status', `"model_status" IN ('none','generating','ready')`)
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'varchar', length: 64 }) sku: string;
  @Column({ type: 'varchar', length: 200 }) name: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) category: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) brand: string | null;
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: numericTransformer }) widthMm: number | null;
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: numericTransformer }) depthMm: number | null;
  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true, transformer: numericTransformer }) heightMm: number | null;
  @Column({ type: 'text', array: true, default: () => `'{}'` }) brandColors: string[];
  @Column({ type: 'varchar', length: 16, default: 'none' }) modelStatus: ModelStatus;
  @Column({ type: 'uuid', nullable: true }) coverAssetId: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) deviceId: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deletedAt: Date | null;
}

export const ASSET_KINDS = ['photo', 'glb', 'label', 'logo', 'music', 'prop'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_STATUSES = ['pending', 'ready'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

@Entity('assets')
@Index('ix_assets_product', ['workspaceId', 'productId'])
@Check('ck_assets_kind', `"kind" IN ('photo','glb','label','logo','music','prop')`)
@Check('ck_assets_status', `"status" IN ('pending','ready')`)
export class AssetEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'uuid' }) productId: string;
  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: ProductEntity;
  @Column({ type: 'varchar', length: 16 }) kind: AssetKind;
  @Column({ type: 'varchar', length: 16, default: 'pending' }) status: AssetStatus;
  @Column({ type: 'varchar', length: 255 }) filename: string;
  @Column({ type: 'varchar', length: 127 }) contentType: string;
  @Column({ type: 'bigint', transformer: bigintTransformer }) sizeBytes: number;
  @Column({ type: 'varchar', length: 64, nullable: true }) sha256: string | null;
  @Index('uq_assets_cloud_key', { unique: true })
  @Column({ type: 'varchar', length: 512 })
  cloudKey: string;
  @Column({ type: 'varchar', length: 128, nullable: true }) etag: string | null;
  @Column({ type: 'jsonb', default: () => `'{}'` }) meta: Record<string, unknown>;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const TEMPLATE_KINDS = ['image', 'video'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];
export const TEMPLATE_OWNERS = ['system', 'workspace'] as const;
export type TemplateOwner = (typeof TEMPLATE_OWNERS)[number];

@Entity('templates')
@Index('ix_templates_workspace', ['workspaceId'])
@Index('ix_templates_kind_category', ['kind', 'category'])
@Check('ck_templates_kind', `"kind" IN ('image','video')`)
@Check('ck_templates_owner', `("owner" = 'system' AND "workspace_id" IS NULL) OR ("owner" = 'workspace' AND "workspace_id" IS NOT NULL)`)
export class TemplateEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  /** NULL = mẫu hệ thống (owner = system). */
  @Column({ type: 'uuid', nullable: true }) workspaceId: string | null;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity | null;
  @Column({ type: 'varchar', length: 16 }) owner: TemplateOwner;
  @Column({ type: 'varchar', length: 16 }) kind: TemplateKind;
  @Column({ type: 'varchar', length: 200 }) name: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) category: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) style: string | null;
  @Column({ type: 'text', array: true, default: () => `'{}'` }) aspectRatios: string[];
  /** Id preset/`.blend` trong runtime pack (tương ứng `scene.template_id` của timeline JSON). */
  @Column({ type: 'varchar', length: 120 }) presetId: string;
  @Column({ type: 'varchar', length: 512, nullable: true }) blendCloudKey: string | null;
  @Column({ type: 'jsonb', default: () => `'[]'` }) components: unknown[];
  @Column({ type: 'jsonb', default: () => `'{}'` }) params: Record<string, unknown>;
  @Column({ type: 'varchar', length: 255, nullable: true }) license: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) source: string | null;
  @Column({ type: 'integer', default: 1 }) version: number;
  @Column({ type: 'boolean', default: true }) published: boolean;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deletedAt: Date | null;
}
