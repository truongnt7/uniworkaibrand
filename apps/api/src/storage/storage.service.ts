import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ENV, Env } from '../config/env';
import { AppException } from '../common/app-exception';

export interface HeadResult {
  size: number;
  contentType: string | undefined;
  etag: string | undefined;
}

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly internal: S3Client;
  private readonly signer: S3Client;
  readonly bucket: string;
  readonly ttl: number;

  constructor(@Inject(ENV) private readonly env: Env) {
    const base = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({ ...base, endpoint: env.S3_ENDPOINT });
    // Client riêng để ký URL theo host mà Electron truy cập được (khác host nội bộ khi chạy sau mạng riêng).
    this.signer = new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
    this.bucket = env.S3_BUCKET;
    this.ttl = env.S3_PRESIGN_TTL_SECONDS;
  }

  async onModuleInit(): Promise<void> {
    if (this.env.S3_AUTO_CREATE_BUCKET) await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.internal.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Đã tạo bucket ${this.bucket}`);
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.internal.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }

  async presignPut(key: string, contentType: string, contentLength: number): Promise<{ url: string; headers: Record<string, string>; expiresAt: Date }> {
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      // Mặc định content-type bị đẩy lên query và không được ràng buộc; ép ký để S3 từ chối khi client đổi loại tệp.
      { expiresIn: this.ttl, signableHeaders: new Set(['content-type']) },
    );
    return { url, headers: { 'Content-Type': contentType }, expiresAt: new Date(Date.now() + this.ttl * 1000) };
  }

  async presignGet(key: string, filename?: string): Promise<{ url: string; expiresAt: Date }> {
    const disposition = filename ? `attachment; filename="${filename.replace(/["\\\r\n]/g, '_')}"` : undefined;
    const url = await getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentDisposition: disposition }),
      { expiresIn: this.ttl },
    );
    return { url, expiresAt: new Date(Date.now() + this.ttl * 1000) };
  }

  async head(key: string): Promise<HeadResult | null> {
    try {
      const out = await this.internal.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: out.ContentLength ?? 0, contentType: out.ContentType, etag: out.ETag?.replace(/"/g, '') };
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return null;
      this.logger.error(`HEAD ${key} thất bại: ${err.name ?? e}`);
      throw new AppException('STORAGE_UNAVAILABLE', 503);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.internal.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      this.logger.warn(`Xóa object ${key} thất bại: ${e instanceof Error ? e.message : e}`);
    }
  }

  onModuleDestroy(): void {
    this.internal.destroy();
    this.signer.destroy();
  }
}
