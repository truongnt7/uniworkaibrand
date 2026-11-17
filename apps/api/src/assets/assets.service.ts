import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/app-exception';
import { AssetEntity, AssetKind } from '../database/entities';
import { ProductEntity } from '../database/entities';
import { StorageService } from '../storage/storage.service';
import { ASSET_RULES, buildAssetKey, extensionOf } from './asset-rules';
import type { CreateAssetDto, LabelPlacementDto } from './assets.dto';

export const assetView = (a: AssetEntity) => ({
  id: a.id,
  productId: a.productId,
  kind: a.kind,
  status: a.status,
  filename: a.filename,
  contentType: a.contentType,
  sizeBytes: a.sizeBytes,
  sha256: a.sha256,
  meta: a.meta,
  createdAt: a.createdAt,
});

@Injectable()
export class AssetsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
  ) {}

  private get repo() {
    return this.ds.getRepository(AssetEntity);
  }

  private async product(workspaceId: string, productId: string): Promise<ProductEntity> {
    const p = await this.ds.getRepository(ProductEntity).findOne({ where: { id: productId, workspaceId } });
    if (!p) throw new AppException('PRODUCT_NOT_FOUND', 404);
    return p;
  }

  private async asset(workspaceId: string, productId: string, id: string): Promise<AssetEntity> {
    const a = await this.repo.findOne({ where: { id, productId, workspaceId } });
    if (!a) throw new AppException('ASSET_NOT_FOUND', 404);
    return a;
  }

  async create(workspaceId: string, productId: string, dto: CreateAssetDto) {
    await this.product(workspaceId, productId);
    const rule = ASSET_RULES[dto.kind];
    if (!rule.contentTypes.includes(dto.contentType) || !rule.extensions.includes(extensionOf(dto.filename))) {
      throw new AppException('ASSET_TYPE_NOT_ALLOWED', 400, { contentType: dto.contentType, kind: dto.kind });
    }
    if (dto.sizeBytes > rule.maxBytes) throw new AppException('ASSET_TOO_LARGE', 400, { maxBytes: rule.maxBytes, kind: dto.kind });
    if (dto.label && dto.kind !== 'label') throw new AppException('VALIDATION_FAILED', 400, {}, [{ field: 'label', constraint: 'whitelistValidation' }]);

    const id = randomUUID();
    const asset = await this.repo.save(
      this.repo.create({
        id,
        workspaceId,
        productId,
        kind: dto.kind,
        status: 'pending',
        filename: dto.filename,
        contentType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        sha256: dto.sha256 ?? null,
        cloudKey: buildAssetKey(workspaceId, productId, dto.kind, id, dto.filename),
        meta: dto.label ? { label: dto.label } : {},
      }),
    );
    return { asset: assetView(asset), upload: await this.presign(asset) };
  }

  /** URL PUT mới cho asset còn `pending` (URL cũ hết hạn). */
  async refreshUpload(workspaceId: string, productId: string, id: string) {
    const a = await this.asset(workspaceId, productId, id);
    if (a.status !== 'pending') throw new AppException('VALIDATION_FAILED', 409);
    return { asset: assetView(a), upload: await this.presign(a) };
  }

  private async presign(a: AssetEntity) {
    const { url, headers, expiresAt } = await this.storage.presignPut(a.cloudKey, a.contentType, a.sizeBytes);
    return { method: 'PUT' as const, url, headers, expiresAt };
  }

  async complete(workspaceId: string, productId: string, id: string) {
    const a = await this.asset(workspaceId, productId, id);
    if (a.status === 'ready') return assetView(a);
    const head = await this.storage.head(a.cloudKey);
    if (!head) throw new AppException('ASSET_NOT_UPLOADED', 409);
    if (head.size !== a.sizeBytes) {
      await this.storage.delete(a.cloudKey);
      throw new AppException('ASSET_SIZE_MISMATCH', 409, { actual: head.size, expected: a.sizeBytes });
    }
    await this.ds.transaction(async (m) => {
      await m.update(AssetEntity, { id: a.id }, { status: 'ready', etag: head.etag ?? null });
      const product = await m.findOne(ProductEntity, { where: { id: productId, workspaceId } });
      if (!product) return;
      const patch: Partial<ProductEntity> = {};
      if (a.kind === 'glb' && product.modelStatus !== 'ready') patch.modelStatus = 'ready';
      if (a.kind === 'photo' && !product.coverAssetId) patch.coverAssetId = a.id;
      if (Object.keys(patch).length) await m.update(ProductEntity, { id: productId }, patch);
    });
    return assetView(await this.asset(workspaceId, productId, id));
  }

  async list(workspaceId: string, productId: string, kind?: AssetKind) {
    await this.product(workspaceId, productId);
    const rows = await this.repo.find({ where: { workspaceId, productId, ...(kind ? { kind } : {}) }, order: { createdAt: 'ASC' } });
    return rows.map(assetView);
  }

  async get(workspaceId: string, productId: string, id: string) {
    return assetView(await this.asset(workspaceId, productId, id));
  }

  async downloadUrl(workspaceId: string, productId: string, id: string) {
    const a = await this.asset(workspaceId, productId, id);
    if (a.status !== 'ready') throw new AppException('ASSET_NOT_READY', 409);
    const { url, expiresAt } = await this.storage.presignGet(a.cloudKey, a.filename);
    return { method: 'GET' as const, url, expiresAt, sha256: a.sha256, sizeBytes: a.sizeBytes };
  }

  async updateLabel(workspaceId: string, productId: string, id: string, label: LabelPlacementDto) {
    const a = await this.asset(workspaceId, productId, id);
    if (a.kind !== 'label') throw new AppException('VALIDATION_FAILED', 400, {}, [{ field: 'label', constraint: 'whitelistValidation' }]);
    await this.repo.update({ id }, { meta: { ...a.meta, label: { ...label } } });
    return this.get(workspaceId, productId, id);
  }

  async remove(workspaceId: string, productId: string, id: string) {
    const a = await this.asset(workspaceId, productId, id);
    await this.ds.transaction(async (m) => {
      await m.delete(AssetEntity, { id });
      const product = await m.findOne(ProductEntity, { where: { id: productId, workspaceId } });
      if (!product) return;
      const patch: Partial<ProductEntity> = {};
      if (product.coverAssetId === id) patch.coverAssetId = null;
      if (a.kind === 'glb' && a.status === 'ready') {
        const remaining = await m.count(AssetEntity, { where: { productId, kind: 'glb', status: 'ready' } });
        if (remaining === 0 && product.modelStatus === 'ready') patch.modelStatus = 'none';
      }
      if (Object.keys(patch).length) await m.update(ProductEntity, { id: productId }, patch);
    });
    await this.storage.delete(a.cloudKey);
  }
}
