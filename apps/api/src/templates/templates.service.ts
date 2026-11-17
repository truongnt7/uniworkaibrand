import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { AppException } from '../common/app-exception';
import { page } from '../common/pagination';
import { TemplateEntity } from '../database/entities';
import type { CreateTemplateDto, ListTemplatesQuery, UpdateTemplateDto } from './templates.dto';

export const templateView = (t: TemplateEntity) => ({
  id: t.id,
  owner: t.owner,
  workspaceId: t.workspaceId,
  kind: t.kind,
  name: t.name,
  category: t.category,
  style: t.style,
  aspectRatios: t.aspectRatios,
  presetId: t.presetId,
  blendCloudKey: t.blendCloudKey,
  components: t.components,
  params: t.params,
  license: t.license,
  source: t.source,
  version: t.version,
  published: t.published,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class TemplatesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  private get repo() {
    return this.ds.getRepository(TemplateEntity);
  }

  async list(workspaceId: string, q: ListTemplatesQuery) {
    const qb = this.repo.createQueryBuilder('t').where('t.deleted_at IS NULL');
    if (q.owner === 'system') qb.andWhere(`t.owner = 'system' AND t.published = true`);
    else if (q.owner === 'workspace') qb.andWhere('t.workspace_id = :workspaceId', { workspaceId });
    else
      qb.andWhere(
        new Brackets((b) => b.where(`t.owner = 'system' AND t.published = true`).orWhere('t.workspace_id = :workspaceId', { workspaceId })),
      );
    if (q.kind) qb.andWhere('t.kind = :kind', { kind: q.kind });
    if (q.category) qb.andWhere('t.category = :category', { category: q.category });
    if (q.aspect) qb.andWhere(':aspect = ANY(t.aspect_ratios)', { aspect: q.aspect });
    if (q.q) qb.andWhere('t.name ILIKE :q', { q: `%${escapeLike(q.q)}%` });
    const [items, total] = await qb.orderBy('t.owner', 'DESC').addOrderBy('t.name', 'ASC').addOrderBy('t.id', 'ASC').take(q.limit).skip(q.offset).getManyAndCount();
    return page(items.map(templateView), total, q);
  }

  async get(workspaceId: string, id: string) {
    const t = await this.repo
      .createQueryBuilder('t')
      .where('t.id = :id AND t.deleted_at IS NULL', { id })
      .andWhere(new Brackets((b) => b.where(`t.owner = 'system' AND t.published = true`).orWhere('t.workspace_id = :workspaceId', { workspaceId })))
      .getOne();
    if (!t) throw new AppException('TEMPLATE_NOT_FOUND', 404);
    return templateView(t);
  }

  private fromDto(dto: CreateTemplateDto, owner: 'system' | 'workspace', workspaceId: string | null, userId: string): Partial<TemplateEntity> {
    return {
      owner,
      workspaceId,
      kind: dto.kind,
      name: dto.name,
      category: dto.category ?? null,
      style: dto.style ?? null,
      aspectRatios: dto.aspectRatios,
      presetId: dto.presetId,
      blendCloudKey: dto.blendCloudKey ?? null,
      components: dto.components ?? [],
      params: dto.params ?? {},
      license: dto.license ?? null,
      source: dto.source ?? null,
      version: dto.version ?? 1,
      published: dto.published ?? true,
      createdBy: userId,
    };
  }

  async createForWorkspace(workspaceId: string, userId: string, dto: CreateTemplateDto) {
    return templateView(await this.repo.save(this.repo.create(this.fromDto(dto, 'workspace', workspaceId, userId))));
  }

  async createSystem(userId: string, dto: CreateTemplateDto) {
    return templateView(await this.repo.save(this.repo.create(this.fromDto(dto, 'system', null, userId))));
  }

  private applyUpdate(dto: UpdateTemplateDto): Partial<TemplateEntity> {
    const patch: Partial<TemplateEntity> = {};
    const keys = ['name', 'category', 'style', 'aspectRatios', 'presetId', 'blendCloudKey', 'components', 'params', 'license', 'source', 'version', 'published'] as const;
    for (const k of keys) if (dto[k] !== undefined) (patch as Record<string, unknown>)[k] = dto[k];
    return patch;
  }

  async updateForWorkspace(workspaceId: string, id: string, dto: UpdateTemplateDto) {
    const t = await this.repo.findOne({ where: { id } });
    if (t && t.owner === 'system') throw new AppException('TEMPLATE_SYSTEM_READONLY', 403);
    if (!t || t.workspaceId !== workspaceId) throw new AppException('TEMPLATE_NOT_FOUND', 404);
    await this.repo.update({ id }, this.applyUpdate(dto) as never);
    return this.get(workspaceId, id);
  }

  async removeForWorkspace(workspaceId: string, id: string) {
    const t = await this.repo.findOne({ where: { id } });
    if (t && t.owner === 'system') throw new AppException('TEMPLATE_SYSTEM_READONLY', 403);
    if (!t || t.workspaceId !== workspaceId) throw new AppException('TEMPLATE_NOT_FOUND', 404);
    await this.repo.softDelete({ id });
  }

  async updateSystem(id: string, dto: UpdateTemplateDto) {
    const t = await this.repo.findOne({ where: { id, owner: 'system' } });
    if (!t) throw new AppException('TEMPLATE_NOT_FOUND', 404);
    await this.repo.update({ id }, this.applyUpdate(dto) as never);
    return templateView((await this.repo.findOne({ where: { id } }))!);
  }

  async removeSystem(id: string) {
    const t = await this.repo.findOne({ where: { id, owner: 'system' } });
    if (!t) throw new AppException('TEMPLATE_NOT_FOUND', 404);
    await this.repo.softDelete({ id });
  }
}
