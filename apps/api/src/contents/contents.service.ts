import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/app-exception';
import { isUniqueViolation } from '../common/db-errors';
import { page } from '../common/pagination';
import { ContentEntity, ContentFolderEntity, ProductEntity } from '../database/entities';
import type { CreateContentDto, CreateFolderDto, ListContentsQuery, UpdateContentDto, UpdateFolderDto } from './contents.dto';

export const contentView = (c: ContentEntity) => ({
  id: c.id,
  productId: c.productId,
  projectVersionId: c.projectVersionId,
  seriesId: c.seriesId,
  versionNo: c.versionNo,
  kind: c.kind,
  name: c.name,
  status: c.status,
  progress: c.progress,
  format: c.format,
  sizeBytes: c.sizeBytes,
  durationMs: c.durationMs,
  width: c.width,
  height: c.height,
  folderId: c.folderId,
  tags: c.tags,
  favorite: c.favorite,
  deviceId: c.deviceId,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

export const folderView = (f: ContentFolderEntity) => ({ id: f.id, parentId: f.parentId, name: f.name, createdAt: f.createdAt, updatedAt: f.updatedAt });

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class ContentsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private get repo() {
    return this.ds.getRepository(ContentEntity);
  }

  private async assertFolder(m: EntityManager | DataSource, workspaceId: string, folderId: string) {
    const f = await m.getRepository(ContentFolderEntity).findOne({ where: { id: folderId, workspaceId } });
    if (!f) throw new AppException('FOLDER_NOT_FOUND', 404);
    return f;
  }

  async create(workspaceId: string, userId: string, dto: CreateContentDto) {
    const product = await this.ds.getRepository(ProductEntity).findOne({ where: { id: dto.productId, workspaceId } });
    if (!product) throw new AppException('PRODUCT_NOT_FOUND', 404);
    if (dto.folderId) await this.assertFolder(this.ds, workspaceId, dto.folderId);
    const status = dto.status ?? 'rendering';
    const c = await this.repo.save(
      this.repo.create({
        workspaceId,
        productId: dto.productId,
        projectVersionId: dto.projectVersionId ?? null,
        seriesId: randomUUID(),
        versionNo: 1,
        kind: dto.kind,
        name: dto.name,
        status,
        progress: dto.progress ?? (status === 'ready' ? 100 : 0),
        format: dto.format ?? null,
        sizeBytes: dto.sizeBytes ?? null,
        durationMs: dto.durationMs ?? null,
        width: dto.width ?? null,
        height: dto.height ?? null,
        folderId: dto.folderId ?? null,
        tags: dto.tags ?? [],
        favorite: dto.favorite ?? false,
        deviceId: dto.deviceId ?? null,
        createdBy: userId,
      }),
    );
    return contentView(c);
  }

  /** Tạo V(n+1) trong cùng series (V1/V2…); siêu dữ liệu kế thừa, trạng thái bắt đầu lại từ 'rendering'. */
  async createVersion(workspaceId: string, userId: string, id: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.ds.transaction(async (m) => {
          const src = await m.findOne(ContentEntity, { where: { id, workspaceId } });
          if (!src) throw new AppException('CONTENT_NOT_FOUND', 404);
          const latest = await m
            .createQueryBuilder(ContentEntity, 'c')
            .select('MAX(c.versionNo)', 'max')
            .where('c.seriesId = :s', { s: src.seriesId })
            .withDeleted()
            .getRawOne<{ max: number }>();
          const next = Number(latest?.max ?? src.versionNo) + 1;
          const copy = await m.save(
            ContentEntity,
            m.create(ContentEntity, {
              workspaceId,
              productId: src.productId,
              projectVersionId: null,
              seriesId: src.seriesId,
              versionNo: next,
              kind: src.kind,
              name: src.name,
              status: 'rendering',
              progress: 0,
              folderId: src.folderId,
              tags: src.tags,
              favorite: false,
              createdBy: userId,
            }),
          );
          return contentView(copy);
        });
      } catch (e) {
        if (isUniqueViolation(e, 'uq_contents_series_version') && attempt < 2) continue;
        throw e;
      }
    }
    throw new AppException('INTERNAL_ERROR', 500);
  }

  async list(workspaceId: string, q: ListContentsQuery) {
    const qb = this.repo.createQueryBuilder('c').where('c.workspaceId = :workspaceId', { workspaceId });
    if (q.productId) qb.andWhere('c.productId = :productId', { productId: q.productId });
    if (q.kind) qb.andWhere('c.kind = :kind', { kind: q.kind });
    if (q.status) qb.andWhere('c.status = :status', { status: q.status });
    if (q.folderId === 'root') qb.andWhere('c.folderId IS NULL');
    else if (q.folderId) qb.andWhere('c.folderId = :folderId', { folderId: q.folderId });
    if (q.tag) qb.andWhere('EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE lower(t) = lower(:tag))', { tag: q.tag });
    if (q.favorite !== undefined) qb.andWhere('c.favorite = :fav', { fav: q.favorite });
    if (q.q) qb.andWhere('c.name ILIKE :q', { q: `%${escapeLike(q.q)}%` });
    if (q.latestOnly) {
      qb.andWhere(
        `c.versionNo = (SELECT MAX(c2.version_no) FROM contents c2 WHERE c2.series_id = c.series_id AND c2.deleted_at IS NULL)`,
      );
    }
    const [items, total] = await qb.orderBy('c.updatedAt', 'DESC').addOrderBy('c.id', 'ASC').take(q.limit).skip(q.offset).getManyAndCount();
    return page(items.map(contentView), total, q);
  }

  private async entity(workspaceId: string, id: string) {
    const c = await this.repo.findOne({ where: { id, workspaceId } });
    if (!c) throw new AppException('CONTENT_NOT_FOUND', 404);
    return c;
  }

  async get(workspaceId: string, id: string) {
    const c = await this.entity(workspaceId, id);
    const versions = await this.repo.find({ where: { seriesId: c.seriesId, workspaceId }, order: { versionNo: 'ASC' }, select: { id: true, versionNo: true, status: true } });
    return { ...contentView(c), versions: versions.map((v) => ({ id: v.id, versionNo: v.versionNo, status: v.status })) };
  }

  async update(workspaceId: string, id: string, dto: UpdateContentDto) {
    const c = await this.entity(workspaceId, id);
    if (dto.folderId) await this.assertFolder(this.ds, workspaceId, dto.folderId);
    const patch: Partial<ContentEntity> = {};
    for (const k of ['name', 'status', 'progress', 'format', 'sizeBytes', 'durationMs', 'width', 'height', 'folderId', 'tags', 'favorite', 'deviceId'] as const) {
      if (dto[k] !== undefined) (patch as Record<string, unknown>)[k] = dto[k];
    }
    if (dto.status === 'ready' && dto.progress === undefined) patch.progress = 100;
    if (Object.keys(patch).length) await this.repo.update({ id: c.id }, patch);
    return contentView(await this.entity(workspaceId, id));
  }

  async remove(workspaceId: string, id: string) {
    await this.entity(workspaceId, id);
    await this.repo.softDelete({ id });
  }

  async tags(workspaceId: string) {
    const rows = await this.ds.query<Array<{ tag: string; count: string }>>(
      `SELECT t AS tag, COUNT(*) AS count FROM contents c, unnest(c.tags) t
       WHERE c.workspace_id = $1 AND c.deleted_at IS NULL GROUP BY t ORDER BY t`,
      [workspaceId],
    );
    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  }

  async listFolders(workspaceId: string) {
    const rows = await this.ds.getRepository(ContentFolderEntity).find({ where: { workspaceId }, order: { name: 'ASC' } });
    return rows.map(folderView);
  }

  async createFolder(workspaceId: string, dto: CreateFolderDto) {
    if (dto.parentId) await this.assertFolder(this.ds, workspaceId, dto.parentId);
    await this.assertFolderNameFree(workspaceId, dto.parentId ?? null, dto.name);
    const f = await this.ds.getRepository(ContentFolderEntity).save({ workspaceId, parentId: dto.parentId ?? null, name: dto.name });
    return folderView(f);
  }

  private async assertFolderNameFree(workspaceId: string, parentId: string | null, name: string, exceptId?: string) {
    const rows = await this.ds
      .getRepository(ContentFolderEntity)
      .createQueryBuilder('f')
      .where('f.workspaceId = :workspaceId AND lower(f.name) = lower(:name)', { workspaceId, name })
      .andWhere(parentId ? 'f.parentId = :parentId' : 'f.parentId IS NULL', { parentId })
      .getMany();
    if (rows.some((r) => r.id !== exceptId)) throw new AppException('FOLDER_NAME_TAKEN', 409);
  }

  async updateFolder(workspaceId: string, id: string, dto: UpdateFolderDto) {
    const f = await this.assertFolder(this.ds, workspaceId, id);
    const parentId = dto.parentId === undefined ? f.parentId : dto.parentId;
    if (dto.parentId) {
      await this.assertFolder(this.ds, workspaceId, dto.parentId);
      const all = await this.ds.getRepository(ContentFolderEntity).find({ where: { workspaceId } });
      const byId = new Map(all.map((x) => [x.id, x]));
      for (let cur: string | null = dto.parentId; cur; cur = byId.get(cur)?.parentId ?? null) {
        if (cur === id) throw new AppException('FOLDER_CYCLE', 400);
      }
    }
    const name = dto.name ?? f.name;
    await this.assertFolderNameFree(workspaceId, parentId, name, id);
    await this.ds.getRepository(ContentFolderEntity).update({ id }, { name, parentId });
    return folderView((await this.ds.getRepository(ContentFolderEntity).findOne({ where: { id } }))!);
  }

  /** Xóa thư mục con theo cascade; nội dung bên trong được đưa về thư mục gốc (FK SET NULL). */
  async removeFolder(workspaceId: string, id: string) {
    await this.assertFolder(this.ds, workspaceId, id);
    await this.ds.getRepository(ContentFolderEntity).delete({ id });
  }
}
