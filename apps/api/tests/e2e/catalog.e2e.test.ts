import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { register, startApp, type TestCtx, type Session } from './harness';

let ctx: TestCtx;
let owner: Session & { workspaceId?: string };
let ws: string;
beforeAll(async () => {
  ctx = await startApp();
  owner = await register(ctx, { workspaceName: 'Catalog WS' });
  ws = owner.workspaceId!;
});
afterAll(async () => { await ctx.close(); });

const newProduct = async (over: Record<string, unknown> = {}) => {
  const res = await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({ sku: `SKU-${Math.random().toString(36).slice(2, 9)}`, name: 'Serum Vitamin C', ...over });
  expect(res.status).toBe(201);
  return res.body as { id: string; sku: string };
};

describe('products', () => {
  it('tạo/đọc/sửa với kích thước, màu thương hiệu, danh mục, thương hiệu', async () => {
    const p = await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({
      sku: 'SR-VITC-30', name: 'Serum Vitamin C 30ml', category: 'Mỹ phẩm', brand: 'UNICOM',
      widthMm: 60, depthMm: 60, heightMm: 146.5, brandColors: ['#c8102e', '#FFFFFF'],
    });
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({
      sku: 'SR-VITC-30', category: 'Mỹ phẩm', brand: 'UNICOM', modelStatus: 'none',
      dimensionsMm: { width: 60, depth: 60, height: 146.5 }, brandColors: ['#C8102E', '#FFFFFF'],
    });
    const upd = await ctx.http.patch(`/workspaces/${ws}/products/${p.body.id}`).set(owner.auth).send({ name: 'Serum C+', heightMm: 150, brandColors: ['#000000'] });
    expect(upd.body).toMatchObject({ name: 'Serum C+', dimensionsMm: { width: 60, depth: 60, height: 150 }, brandColors: ['#000000'] });
    const get = await ctx.http.get(`/workspaces/${ws}/products/${p.body.id}`).set(owner.auth);
    expect(get.body.assets).toEqual([]);
  });

  it('SKU trùng trong workspace -> 409; SKU cùng tên ở workspace khác thì được; SKU của sản phẩm đã xóa dùng lại được', async () => {
    const p = await newProduct({ sku: 'DUP-1' });
    const dup = await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({ sku: 'DUP-1', name: 'x' });
    expect(dup.status).toBe(409);
    expect(dup.body).toMatchObject({ code: 'PRODUCT_SKU_TAKEN', message: 'SKU DUP-1 đã tồn tại trong workspace' });
    const other = await register(ctx, { workspaceName: 'Other' });
    expect((await ctx.http.post(`/workspaces/${other.workspaceId}/products`).set(other.auth).send({ sku: 'DUP-1', name: 'x' })).status).toBe(201);
    expect((await ctx.http.delete(`/workspaces/${ws}/products/${p.id}`).set(owner.auth)).status).toBe(204);
    expect((await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({ sku: 'DUP-1', name: 'again' })).status).toBe(201);
    expect((await ctx.http.get(`/workspaces/${ws}/products/${p.id}`).set(owner.auth)).status).toBe(404);
  });

  it('validation: màu sai, kích thước âm, quá nhiều màu', async () => {
    const bad = await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({ sku: 'V1', name: 'x', brandColors: ['red'], widthMm: -5 });
    expect(bad.status).toBe(400);
    expect(bad.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['brandColors', 'widthMm']);
    const many = await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({ sku: 'V2', name: 'x', brandColors: Array(9).fill('#000000') });
    expect(many.status).toBe(400);
  });

  it('lọc/tìm kiếm/phân trang; hasModel; cô lập giữa các workspace', async () => {
    const w = await register(ctx, { workspaceName: 'Filter WS' });
    const mk = (b: object) => ctx.http.post(`/workspaces/${w.workspaceId}/products`).set(w.auth).send(b);
    await mk({ sku: 'F-1', name: 'Son môi đỏ', category: 'Mỹ phẩm', brand: 'Alpha' });
    await mk({ sku: 'F-2', name: 'Trà ô long', category: 'F&B', brand: 'Beta' });
    const third = await mk({ sku: 'F-3', name: 'Hộp quà 50%_off', category: 'Quà tặng', brand: 'Alpha' });
    const list = (qs: string) => ctx.http.get(`/workspaces/${w.workspaceId}/products?${qs}`).set(w.auth);

    expect((await list('')).body.total).toBe(3);
    expect((await list('q=son')).body.items.map((i: { sku: string }) => i.sku)).toEqual(['F-1']);
    expect((await list('brand=Alpha')).body.total).toBe(2);
    expect((await list('category=F%26B')).body.items[0].sku).toBe('F-2');
    expect((await list('q=50%25_off')).body.total).toBe(1);
    expect((await list('q=%25')).body.total).toBe(1); // % được escape: chỉ khớp ký tự % thật, không phải wildcard
    const paged = await list('limit=2&offset=2');
    expect(paged.body).toMatchObject({ total: 3, limit: 2, offset: 2 });
    expect(paged.body.items).toHaveLength(1);
    expect((await list('hasModel=true')).body.total).toBe(0);
    expect((await list('hasModel=false')).body.total).toBe(3);
    expect((await list('limit=1000')).status).toBe(400);

    await ctx.ds.query(`UPDATE products SET model_status='ready' WHERE id=$1`, [third.body.id]);
    expect((await list('hasModel=true')).body.items.map((i: { sku: string }) => i.sku)).toEqual(['F-3']);

    const mine = await ctx.http.get(`/workspaces/${ws}/products?q=Son%20m%C3%B4i`).set(owner.auth);
    expect(mine.body.total).toBe(0);
    expect((await ctx.http.get(`/workspaces/${w.workspaceId}/products`).set(owner.auth)).status).toBe(404);
  });
});

describe('assets: presigned upload lên MinIO', () => {
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const glb = Buffer.concat([Buffer.from('glTF'), Buffer.alloc(2048, 7)]);

  const declare = (productId: string, body: object) => ctx.http.post(`/workspaces/${ws}/products/${productId}/assets`).set(owner.auth).send(body);

  it('luồng đầy đủ: khai báo -> PUT presigned -> complete -> tải xuống; glb đặt model_status=ready, ảnh đầu tiên là ảnh bìa', async () => {
    const product = await newProduct();

    const photoBytes = Buffer.from('89504e470d0a1a0a', 'hex');
    const photo = await declare(product.id, { kind: 'photo', filename: 'front.png', contentType: 'image/png', sizeBytes: photoBytes.length, sha256: sha(photoBytes) });
    expect(photo.status).toBe(201);
    expect(photo.body.asset.status).toBe('pending');
    expect(photo.body.upload).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });
    expect(new URL(photo.body.upload.url).searchParams.get('X-Amz-Signature')).toBeTruthy();

    // chưa tải mà complete -> lỗi
    const early = await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${photo.body.asset.id}/complete`).set(owner.auth);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('ASSET_NOT_UPLOADED');

    const put = await fetch(photo.body.upload.url, { method: 'PUT', headers: photo.body.upload.headers, body: photoBytes });
    expect(put.status).toBe(200);
    const done = await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${photo.body.asset.id}/complete`).set(owner.auth);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('ready');
    // complete lặp lại là idempotent
    expect((await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${photo.body.asset.id}/complete`).set(owner.auth)).status).toBe(200);

    const glbRes = await declare(product.id, { kind: 'glb', filename: 'serum.glb', contentType: 'model/gltf-binary', sizeBytes: glb.length, sha256: sha(glb) });
    expect((await fetch(glbRes.body.upload.url, { method: 'PUT', headers: glbRes.body.upload.headers, body: glb })).status).toBe(200);
    await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${glbRes.body.asset.id}/complete`).set(owner.auth).expect(200);

    const detail = await ctx.http.get(`/workspaces/${ws}/products/${product.id}`).set(owner.auth);
    expect(detail.body).toMatchObject({ modelStatus: 'ready', coverAssetId: photo.body.asset.id });
    expect(detail.body.assets.map((a: { kind: string }) => a.kind).sort()).toEqual(['glb', 'photo']);

    const dl = await ctx.http.get(`/workspaces/${ws}/products/${product.id}/assets/${glbRes.body.asset.id}/download-url`).set(owner.auth);
    expect(dl.status).toBe(200);
    const got = await fetch(dl.body.url);
    expect(got.status).toBe(200);
    const body = Buffer.from(await got.arrayBuffer());
    expect(sha(body)).toBe(sha(glb));
    expect(got.headers.get('content-disposition')).toContain('serum.glb');

    // xóa glb -> model_status quay về none và object bị xóa khỏi S3
    await ctx.http.delete(`/workspaces/${ws}/products/${product.id}/assets/${glbRes.body.asset.id}`).set(owner.auth).expect(204);
    expect((await ctx.http.get(`/workspaces/${ws}/products/${product.id}`).set(owner.auth)).body.modelStatus).toBe('none');
    expect((await fetch(dl.body.url)).status).toBe(404);
  });

  it('PUT sai dung lượng bị S3 từ chối; nếu lách được thì complete phát hiện lệch dung lượng', async () => {
    const product = await newProduct();
    const bytes = Buffer.alloc(100, 1);
    const a = await declare(product.id, { kind: 'photo', filename: 'a.png', contentType: 'image/png', sizeBytes: bytes.length });
    const wrong = await fetch(a.body.upload.url, { method: 'PUT', headers: a.body.upload.headers, body: Buffer.alloc(150, 1) });
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    // ký lại URL cho dung lượng lớn hơn rồi ghi đè trực tiếp để mô phỏng client gian lận
    const { StorageService } = await import('../../src/storage/storage.service');
    const storage = ctx.app.get(StorageService);
    const key = (await ctx.ds.query(`SELECT cloud_key FROM assets WHERE id=$1`, [a.body.asset.id]))[0].cloud_key as string;
    const forged = await storage.presignPut(key, 'image/png', 150);
    expect((await fetch(forged.url, { method: 'PUT', headers: forged.headers, body: Buffer.alloc(150, 1) })).status).toBe(200);
    const done = await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}/complete`).set(owner.auth);
    expect(done.status).toBe(409);
    expect(done.body.code).toBe('ASSET_SIZE_MISMATCH');
    expect(await storage.head(key)).toBeNull();
  });

  it('PUT với Content-Type khác bị từ chối (chữ ký gắn với content-type)', async () => {
    const product = await newProduct();
    const a = await declare(product.id, { kind: 'photo', filename: 'a.png', contentType: 'image/png', sizeBytes: 10 });
    const res = await fetch(a.body.upload.url, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: Buffer.alloc(10) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('từ chối loại tệp/đuôi tệp/dung lượng không hợp lệ (.blend, exe, glb quá lớn)', async () => {
    const product = await newProduct();
    const cases: Array<[object, string]> = [
      [{ kind: 'glb', filename: 'scene.blend', contentType: 'application/octet-stream', sizeBytes: 10 }, 'ASSET_TYPE_NOT_ALLOWED'],
      [{ kind: 'photo', filename: 'x.exe', contentType: 'image/png', sizeBytes: 10 }, 'ASSET_TYPE_NOT_ALLOWED'],
      [{ kind: 'photo', filename: 'x.png', contentType: 'text/html', sizeBytes: 10 }, 'ASSET_TYPE_NOT_ALLOWED'],
      [{ kind: 'label', filename: 'l.jpg', contentType: 'image/jpeg', sizeBytes: 10 }, 'ASSET_TYPE_NOT_ALLOWED'],
      [{ kind: 'glb', filename: 'big.glb', contentType: 'model/gltf-binary', sizeBytes: 151 * 1024 * 1024 }, 'ASSET_TOO_LARGE'],
    ];
    for (const [body, code] of cases) {
      const res = await declare(product.id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe(code);
    }
  });

  it('label.png lưu meta vị trí/rộng/cao/kiểu chiếu và cập nhật được', async () => {
    const product = await newProduct();
    const label = { projection: 'cylindrical', positionU: 0.5, positionV: 0.4, widthMm: 80, heightMm: 40 };
    const a = await declare(product.id, { kind: 'label', filename: 'label.png', contentType: 'image/png', sizeBytes: 10, label });
    expect(a.status).toBe(201);
    expect(a.body.asset.meta.label).toEqual(label);
    const upd = await ctx.http.patch(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}/label`).set(owner.auth).send({ label: { projection: 'planar', widthMm: 55 } });
    expect(upd.body.meta.label).toEqual({ projection: 'planar', widthMm: 55 });
    const bad = await declare(product.id, { kind: 'label', filename: 'l.png', contentType: 'image/png', sizeBytes: 10, label: { projection: 'spherical' } });
    expect(bad.status).toBe(400);
    const wrongKind = await declare(product.id, { kind: 'photo', filename: 'p.png', contentType: 'image/png', sizeBytes: 10, label });
    expect(wrongKind.status).toBe(400);
  });

  it('ảnh bìa chỉ nhận ảnh đã sẵn sàng của chính sản phẩm', async () => {
    const p1 = await newProduct();
    const p2 = await newProduct();
    const a = await declare(p2.id, { kind: 'photo', filename: 'a.png', contentType: 'image/png', sizeBytes: 4 });
    const res = await ctx.http.patch(`/workspaces/${ws}/products/${p1.id}`).set(owner.auth).send({ coverAssetId: a.body.asset.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('ASSET_COVER_INVALID');
  });

  it('tệp của workspace khác không truy cập được; asset dưới product khác -> 404', async () => {
    const product = await newProduct();
    const other = await register(ctx, { workspaceName: 'Intruder' });
    const a = await declare(product.id, { kind: 'photo', filename: 'a.png', contentType: 'image/png', sizeBytes: 4 });
    const res = await ctx.http.get(`/workspaces/${other.workspaceId}/products/${product.id}/assets/${a.body.asset.id}`).set(other.auth);
    expect(res.status).toBe(404);
    const crossWs = await ctx.http.get(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}`).set(other.auth);
    expect(crossWs.status).toBe(404);
    const p2 = await newProduct();
    expect((await ctx.http.get(`/workspaces/${ws}/products/${p2.id}/assets/${a.body.asset.id}`).set(owner.auth)).status).toBe(404);
    expect((await ctx.http.get(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}/download-url`).set(owner.auth)).body.code).toBe('ASSET_NOT_READY');
  });

  it('cấp lại upload-url cho asset pending', async () => {
    const product = await newProduct();
    const a = await declare(product.id, { kind: 'photo', filename: 'a.png', contentType: 'image/png', sizeBytes: 4 });
    const again = await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}/upload-url`).set(owner.auth);
    expect(again.status).toBe(200);
    const bytes = Buffer.from([1, 2, 3, 4]);
    expect((await fetch(again.body.upload.url, { method: 'PUT', headers: again.body.upload.headers, body: bytes })).status).toBe(200);
    await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}/complete`).set(owner.auth).expect(200);
    expect((await ctx.http.post(`/workspaces/${ws}/products/${product.id}/assets/${a.body.asset.id}/upload-url`).set(owner.auth)).status).toBe(409);
  });
});
