import { Check, Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { bigintTransformer } from './transformers';
import { WorkspaceEntity } from './identity.entities';
import { ProductEntity } from './catalog.entities';

@Entity('content_folders')
@Index('ix_content_folders_workspace', ['workspaceId'])
export class ContentFolderEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'uuid', nullable: true }) parentId: string | null;
  @ManyToOne(() => ContentFolderEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: ContentFolderEntity | null;
  @Column({ type: 'varchar', length: 120 }) name: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

export const CONTENT_KINDS = ['image', 'video'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export const CONTENT_STATUSES = ['rendering', 'ready', 'failed'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

@Entity('contents')
@Unique('uq_contents_series_version', ['seriesId', 'versionNo'])
@Index('ix_contents_workspace_updated', ['workspaceId', 'updatedAt'])
@Index('ix_contents_product', ['productId'])
@Index('ix_contents_folder', ['folderId'])
@Check('ck_contents_kind', `"kind" IN ('image','video')`)
@Check('ck_contents_status', `"status" IN ('rendering','ready','failed')`)
@Check('ck_contents_progress', '"progress" BETWEEN 0 AND 100')
export class ContentEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) workspaceId: string;
  @ManyToOne(() => WorkspaceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: WorkspaceEntity;
  @Column({ type: 'uuid' }) productId: string;
  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: ProductEntity;
  /** Tham chiếu ProjectVersion (chưa có bảng ở MVP backend; client giữ id local). */
  @Column({ type: 'uuid', nullable: true }) projectVersionId: string | null;
  /** Các phiên bản V1/V2... của cùng một nội dung dùng chung series_id. */
  @Column({ type: 'uuid' }) seriesId: string;
  @Column({ type: 'integer', default: 1 }) versionNo: number;
  @Column({ type: 'varchar', length: 16 }) kind: ContentKind;
  @Column({ type: 'varchar', length: 200 }) name: string;
  @Column({ type: 'varchar', length: 16, default: 'rendering' }) status: ContentStatus;
  @Column({ type: 'integer', default: 0 }) progress: number;
  @Column({ type: 'varchar', length: 32, nullable: true }) format: string | null;
  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer }) sizeBytes: number | null;
  @Column({ type: 'integer', nullable: true }) durationMs: number | null;
  @Column({ type: 'integer', nullable: true }) width: number | null;
  @Column({ type: 'integer', nullable: true }) height: number | null;
  @Column({ type: 'varchar', length: 512, nullable: true }) cloudKey: string | null;
  @Column({ type: 'uuid', nullable: true }) folderId: string | null;
  @ManyToOne(() => ContentFolderEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'folder_id' })
  folder: ContentFolderEntity | null;
  /** Chỉ mục GIN cho tags được tạo thủ công trong migration (TypeORM không mô tả được). */
  @Column({ type: 'text', array: true, default: () => `'{}'` }) tags: string[];
  @Column({ type: 'boolean', default: false }) favorite: boolean;
  @Column({ type: 'varchar', length: 64, nullable: true }) deviceId: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @DeleteDateColumn({ type: 'timestamptz' }) deletedAt: Date | null;
}
