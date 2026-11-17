import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ENV, Env } from '../config/env';
import { AppException } from '../common/app-exception';
import { isUniqueViolation } from '../common/db-errors';
import { RuntimeReleaseEntity } from '../database/entities';
import { ManifestSigner, SignedEnvelope } from './manifest-signer';
import { ReleaseManifest, ReleaseManifestSchema, ServedManifest } from './manifest.schema';
import defaultManifest from './default-manifest.json';

@Injectable()
export class RuntimeService implements OnModuleInit {
  private readonly logger = new Logger(RuntimeService.name);
  readonly signer: ManifestSigner;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @InjectDataSource() private readonly ds: DataSource,
  ) {
    // Ném lỗi lúc khởi động nếu cấu hình khóa sai (vd. khóa dev trong production).
    this.signer = new ManifestSigner(env.isProduction ? 'production' : 'development', env.MANIFEST_SIGNING_KEY, env.MANIFEST_KEY_ID ?? null);
  }

  async onModuleInit(): Promise<void> {
    if (!this.signer.configured) {
      this.logger.warn('MANIFEST_SIGNING_KEY chưa đặt: GET /runtime/manifest sẽ trả 503 (chạy `pnpm --filter @aps/api keys:dev`).');
    }
    const repo = this.ds.getRepository(RuntimeReleaseEntity);
    if (await repo.exists({ where: { channel: 'stable', isActive: true } })) return;
    try {
      await repo.save(repo.create({ channel: 'stable', manifest: defaultManifest as Record<string, unknown>, isActive: true, note: 'Bản mặc định kèm mã nguồn (Blender 4.5 LTS)' }));
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }

  validate(manifest: unknown): ReleaseManifest {
    const parsed = ReleaseManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      const reason = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
      throw new AppException('RUNTIME_MANIFEST_INVALID', 400, { reason });
    }
    if (this.env.isProduction) {
      const urls = [...Object.values(parsed.data.blender.artifacts), ...Object.values(parsed.data.ffmpeg.artifacts)].flatMap((a) => [a.url, ...a.mirrors]);
      const bad = urls.find((u) => !u.startsWith('https://'));
      if (bad) throw new AppException('RUNTIME_MANIFEST_INVALID', 400, { reason: `production yêu cầu https: ${bad}` });
    }
    return parsed.data;
  }

  async publish(manifest: unknown, note: string | undefined, activate: boolean, userId: string) {
    const valid = this.validate(manifest);
    return this.ds.transaction(async (m) => {
      if (activate) await m.update(RuntimeReleaseEntity, { channel: 'stable', isActive: true }, { isActive: false });
      const row = await m.save(RuntimeReleaseEntity, m.create(RuntimeReleaseEntity, { channel: 'stable', manifest: valid as unknown as Record<string, unknown>, isActive: activate, note: note ?? null, createdBy: userId }));
      return { id: row.id, channel: row.channel, isActive: row.isActive, note: row.note, createdAt: row.createdAt };
    });
  }

  async activate(id: string) {
    await this.ds.transaction(async (m) => {
      const row = await m.findOne(RuntimeReleaseEntity, { where: { id } });
      if (!row) throw new AppException('RUNTIME_MANIFEST_UNAVAILABLE', 404);
      await m.update(RuntimeReleaseEntity, { channel: row.channel, isActive: true }, { isActive: false });
      await m.update(RuntimeReleaseEntity, { id }, { isActive: true });
    });
  }

  async listReleases() {
    const rows = await this.ds.getRepository(RuntimeReleaseEntity).find({ order: { createdAt: 'DESC' }, take: 50 });
    return rows.map((r) => ({ id: r.id, channel: r.channel, isActive: r.isActive, note: r.note, createdAt: r.createdAt, manifest: r.manifest }));
  }

  /** Dựng manifest phục vụ cho client: cố định thứ tự khóa để chuỗi ký ổn định giữa các lần gọi. */
  async signedManifest(channel = 'stable'): Promise<SignedEnvelope> {
    if (!this.signer.configured) throw new AppException('RUNTIME_SIGNING_UNAVAILABLE', 503);
    const row = await this.ds.getRepository(RuntimeReleaseEntity).findOne({ where: { channel, isActive: true } });
    if (!row) throw new AppException('RUNTIME_MANIFEST_UNAVAILABLE', 404);
    const m = ReleaseManifestSchema.parse(row.manifest);
    const served: ServedManifest = {
      schemaVersion: m.schemaVersion,
      environment: this.signer.environment,
      releaseId: row.id,
      blender: m.blender,
      ffmpeg: m.ffmpeg,
    };
    return this.signer.sign(JSON.stringify(served));
  }

  publicKeys() {
    if (!this.signer.configured) return { keys: [] };
    return {
      keys: [{ keyId: this.signer.keyId, algorithm: 'ed25519', environment: this.signer.environment, publicKeyPem: this.signer.publicKeyPem }],
    };
  }
}
