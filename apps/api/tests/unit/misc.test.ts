import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';
import { buildAssetKey, extensionOf, sanitizeFilename } from '../../src/assets/asset-rules';
import { flattenValidationErrors } from '../../src/common/validation';
import { isUuid } from '../../src/common/db-errors';

const base = {
  DATABASE_URL: 'postgres://a:b@localhost/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'k',
  S3_SECRET_KEY: 's',
  S3_BUCKET: 'bucket',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
} as NodeJS.ProcessEnv;

describe('loadEnv', () => {
  it('giá trị mặc định: development, vi, rate limit bật, swagger bật', () => {
    const env = loadEnv(base);
    expect(env).toMatchObject({ APS_ENV: 'development', DEFAULT_LOCALE: 'vi', RATE_LIMIT_ENABLED: true, swaggerEnabled: true, isProduction: false, S3_FORCE_PATH_STYLE: true });
  });

  it('production tắt swagger mặc định và từ chối secret mẫu', () => {
    expect(loadEnv({ ...base, APS_ENV: 'production' }).swaggerEnabled).toBe(false);
    expect(loadEnv({ ...base, APS_ENV: 'production', SWAGGER_ENABLED: 'true' }).swaggerEnabled).toBe(true);
    expect(() => loadEnv({ ...base, APS_ENV: 'production', JWT_ACCESS_SECRET: 'change-me-dev-only-0123456789abcdef0123456789' })).toThrow(/mẫu/);
  });

  it('báo lỗi rõ khi thiếu/sai cấu hình', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadEnv({ ...base, S3_ENDPOINT: 'not a url' })).toThrow(/S3_ENDPOINT/);
    expect(() => loadEnv({ ...base, DEFAULT_LOCALE: 'fr' })).toThrow(/DEFAULT_LOCALE/);
  });
});

describe('asset rules', () => {
  it('sanitizeFilename chặn path traversal và ký tự lạ', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\x\\serum final.glb')).toBe('serum_final.glb');
    expect(sanitizeFilename('.env')).toBe('env');
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('ảnh sản phẩm.png')).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(sanitizeFilename('a'.repeat(300) + '.png').length).toBeLessThanOrEqual(100);
  });

  it('key S3 nằm dưới workspace/product và duy nhất theo assetId', () => {
    const k = buildAssetKey('w1', 'p1', 'glb', 'a1', '../x.glb');
    expect(k).toBe('workspaces/w1/products/p1/glb/a1/x.glb');
    expect(k).not.toContain('..');
  });

  it('extensionOf viết thường', () => {
    expect(extensionOf('A.GLB')).toBe('.glb');
    expect(extensionOf('noext')).toBe('');
  });
});

describe('validation helpers', () => {
  it('flatten lỗi lồng nhau thành đường dẫn field', () => {
    const issues = flattenValidationErrors([
      { property: 'label', constraints: undefined, children: [{ property: 'projection', constraints: { isIn: 'x' }, children: [] }] },
      { property: 'name', constraints: { isNotEmpty: 'x', isString: 'y' } },
    ]);
    expect(issues).toEqual([
      { field: 'label.projection', constraint: 'isIn' },
      { field: 'name', constraint: 'isNotEmpty' },
      { field: 'name', constraint: 'isString' },
    ]);
  });

  it('isUuid', () => {
    expect(isUuid('00000000-0000-4000-8000-000000000000')).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
