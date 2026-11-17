import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike, Not, Equal, FindOptionsWhere } from 'typeorm';
import { AppException } from '../common/app-exception';
import { isUniqueViolation } from '../common/db-errors';
import { page } from '../common/pagination';
import { AssetEntity, ProductEntity } from '../database/entities';
import type { CreateProductDto, ListProductsQuery, UpdateProductDto } from './products.dto';

export const productView = (p: ProductEntity) => ({
  id: p.id,
  workspaceId: p.workspaceId,
  sku: p.sku,
  name: p.name,
  category: p.category,
  brand: p.brand,
  dimensionsMm: { width: p.widthMm, depth: p.depthMm, height: p.heightMm },
  brandColors: p.brandColors,
  modelStatus: p.modelStatus,
  coverAssetId: p.coverAssetId,
  deviceId: p.deviceId,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class ProductsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private get repo() {
    return this.ds.getRepository(ProductEntity);
  }

  async create(workspaceId: string, dto: CreateProductDto) {
    try {
      const p = await this.repo.save(
        this.repo.create({
          workspaceId,
          sku: dto.sku,
          name: dto.name,
          category: dto.category ?? null,
          brand: dto.brand ?? null,
          widthMm: dto.widthMm ?? null,
          depthMm: dto.depthMm ?? null,
          heightMm: dto.heightMm ?? null,
          brandColors: (dto.brandColors ?? []).map((c) => c.toUpperCase()),
          deviceId: dto.deviceId ?? null,
        }),
      );
      return productView(p);
    } catch (e) {
      if (isUniqueViolation(e, 'uq_products_workspace_sku')) throw new AppException('PRODUCT_SKU_TAKEN', 409, { sku: dto.sku });
      throw e;
    }
  }

  async list(workspaceId: string, q: ListProductsQuery) {
    const base: FindOptionsWhere<ProductEntity> = { workspaceId };
    if (q.category) base.category = q.category;
    if (q.brand) base.brand = q.brand;
    if (q.hasModel === true) base.modelStatus = Equal('ready');
    if (q.hasModel === false) base.modelStatus = Not('ready');
    const where: FindOptionsWhere<ProductEntity>[] = q.q
      ? ['name', 'sku', 'brand'].map((f) => ({ ...base, [f]: ILike(`%${escapeLike(q.q!)}%`) }))
      : [base];
    const [items, total] = await this.repo.findAndCount({ where, order: { updatedAt: 'DESC', id: 'ASC' }, take: q.limit, skip: q.offset });
    return page(items.map(productView), total, q);
  }

  async getEntity(workspaceId: string, id: string): Promise<ProductEntity> {
    const p = await this.repo.findOne({ where: { id, workspaceId } });
    if (!p) throw new AppException('PRODUCT_NOT_FOUND', 404);
    return p;
  }

  async get(workspaceId: string, id: string) {
    const p = await this.getEntity(workspaceId, id);
    const assets = await this.ds.getRepository(AssetEntity).find({ where: { productId: id, workspaceId, status: 'ready' }, order: { createdAt: 'ASC' } });
    return {
      ...productView(p),
      assets: assets.map((a) => ({ id: a.id, kind: a.kind, filename: a.filename, contentType: a.contentType, sizeBytes: a.sizeBytes, sha256: a.sha256, meta: a.meta })),
    };
  }

  async update(workspaceId: string, id: string, dto: UpdateProductDto) {
    const p = await this.getEntity(workspaceId, id);
    if (dto.coverAssetId) {
      const cover = await this.ds.getRepository(AssetEntity).findOne({ where: { id: dto.coverAssetId, workspaceId, productId: id } });
      if (!cover || cover.kind !== 'photo' || cover.status !== 'ready') throw new AppException('ASSET_COVER_INVALID', 400);
    }
    const patch: Partial<ProductEntity> = {};
    if (dto.sku !== undefined) patch.sku = dto.sku;
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.category !== undefined) patch.category = dto.category || null;
    if (dto.brand !== undefined) patch.brand = dto.brand || null;
    if (dto.widthMm !== undefined) patch.widthMm = dto.widthMm;
    if (dto.depthMm !== undefined) patch.depthMm = dto.depthMm;
    if (dto.heightMm !== undefined) patch.heightMm = dto.heightMm;
    if (dto.brandColors !== undefined) patch.brandColors = dto.brandColors.map((c) => c.toUpperCase());
    if (dto.modelStatus !== undefined && p.modelStatus !== 'ready') patch.modelStatus = dto.modelStatus;
    if (dto.coverAssetId !== undefined) patch.coverAssetId = dto.coverAssetId;
    if (dto.deviceId !== undefined) patch.deviceId = dto.deviceId;
    try {
      await this.repo.update({ id, workspaceId }, patch);
    } catch (e) {
      if (isUniqueViolation(e, 'uq_products_workspace_sku')) throw new AppException('PRODUCT_SKU_TAKEN', 409, { sku: dto.sku ?? p.sku });
      throw e;
    }
    return productView(await this.getEntity(workspaceId, id));
  }

  async remove(workspaceId: string, id: string) {
    await this.getEntity(workspaceId, id);
    await this.repo.softDelete({ id, workspaceId });
  }
}
