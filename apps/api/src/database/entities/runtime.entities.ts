import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Manifest chưa ký; chữ ký tạo lúc phục vụ bằng khóa lấy từ biến môi trường. */
@Entity('runtime_releases')
@Index('uq_runtime_releases_active', ['channel'], { unique: true, where: '"is_active" = true' })
export class RuntimeReleaseEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 32, default: 'stable' }) channel: string;
  @Column({ type: 'jsonb' }) manifest: Record<string, unknown>;
  @Column({ type: 'boolean', default: false }) isActive: boolean;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
