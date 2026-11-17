import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makePlatformAdmin, register, startApp, type Session, type TestCtx } from './harness';

let ctx: TestCtx;
let owner: Session & { workspaceId?: string };
let ws: string;
let productId: string;
beforeAll(async () => {
  ctx = await startApp();
  owner = await register(ctx, { workspaceName: 'Library WS' });
  ws = owner.workspaceId!;
  productId = (await ctx.http.post(`/workspaces/${ws}/products`).set(owner.auth).send({ sku: 'LIB-1', name: 'P' })).body.id;
});
afterAll(async () => { await ctx.close(); });

const tpl = (over: object = {}) => ({
  kind: 'video', name: 'Thiên nhiên nhẹ', category: 'Mỹ phẩm', aspectRatios: ['1:1', '9:16'], presetId: 'nature-soft',
  components: [{ id: 'podium', label: 'Bục', default: true }], params: { palette: 'brand' }, license: 'CC0 (Poly Haven)', source: 'in-house', ...over,
});

describe('templates', () => {
  it('mẫu workspace: CRUD; mẫu hệ thống do platform admin tạo và mọi workspace thấy nhưng không sửa được', async () => {
    const created = await ctx.http.post(`/workspaces/${ws}/templates`).set(owner.auth).send(tpl());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ owner: 'workspace', workspaceId: ws, version: 1, license: 'CC0 (Poly Haven)', presetId: 'nature-soft' });
    const upd = await ctx.http.patch(`/workspaces/${ws}/templates/${created.body.id}`).set(owner.auth).send({ name: 'Mẫu của tôi', version: 2 });
    expect(upd.body).toMatchObject({ name: 'Mẫu của tôi', version: 2 });

    const admin = await makePlatformAdmin(ctx);
    const sys = await ctx.http.post('/admin/templates').set(admin.auth).send(tpl({ name: 'Studio tối giản', kind: 'image', presetId: 'studio-min' }));
    expect(sys.status).toBe(201);
    expect(sys.body).toMatchObject({ owner: 'system', workspaceId: null });
    expect((await ctx.http.post('/admin/templates').set(owner.auth).send(tpl())).status).toBe(403);

    const other = await register(ctx, { workspaceName: 'Other tpl' });
    const otherList = await ctx.http.get(`/workspaces/${other.workspaceId}/templates`).set(other.auth);
    const names = otherList.body.items.map((t: { name: string }) => t.name);
    expect(names).toContain('Studio tối giản');
    expect(names).not.toContain('Mẫu của tôi');

    const ro = await ctx.http.patch(`/workspaces/${ws}/templates/${sys.body.id}`).set(owner.auth).send({ name: 'x' });
    expect(ro.status).toBe(403);
    expect(ro.body.code).toBe('TEMPLATE_SYSTEM_READONLY');
    expect((await ctx.http.delete(`/workspaces/${ws}/templates/${sys.body.id}`).set(owner.auth)).status).toBe(403);
    expect((await ctx.http.patch(`/workspaces/${other.workspaceId}/templates/${created.body.id}`).set(other.auth).send({ name: 'x' })).status).toBe(404);
    expect((await ctx.http.get(`/workspaces/${other.workspaceId}/templates/${created.body.id}`).set(other.auth)).status).toBe(404);

    await ctx.http.delete(`/workspaces/${ws}/templates/${created.body.id}`).set(owner.auth).expect(204);
    expect((await ctx.http.get(`/workspaces/${ws}/templates/${created.body.id}`).set(owner.auth)).status).toBe(404);
  });

  it('lọc theo loại, danh mục, tỷ lệ, owner, tên; mẫu hệ thống chưa publish bị ẩn', async () => {
    const admin = await makePlatformAdmin(ctx);
    const w = await register(ctx, { workspaceName: 'Tpl filter' });
    const mk = (b: object) => ctx.http.post('/admin/templates').set(admin.auth).send(b);
    await mk(tpl({ name: 'ZZ-A', kind: 'image', category: 'ZZ-Cat', aspectRatios: ['4:5'] }));
    await mk(tpl({ name: 'ZZ-B', kind: 'video', category: 'ZZ-Cat', aspectRatios: ['16:9'] }));
    await mk(tpl({ name: 'ZZ-Hidden', kind: 'video', category: 'ZZ-Cat', aspectRatios: ['16:9'], published: false }));
    await ctx.http.post(`/workspaces/${w.workspaceId}/templates`).set(w.auth).send(tpl({ name: 'ZZ-Mine', category: 'ZZ-Cat' }));
    const list = async (qs: string) => (await ctx.http.get(`/workspaces/${w.workspaceId}/templates?category=ZZ-Cat&${qs}`).set(w.auth)).body.items.map((t: { name: string }) => t.name).sort();
    expect(await list('')).toEqual(['ZZ-A', 'ZZ-B', 'ZZ-Mine']);
    expect(await list('kind=image')).toEqual(['ZZ-A']);
    expect(await list('aspect=16:9')).toEqual(['ZZ-B']);
    expect(await list('owner=workspace')).toEqual(['ZZ-Mine']);
    expect(await list('owner=system')).toEqual(['ZZ-A', 'ZZ-B']);
    expect(await list('q=zz-b')).toEqual(['ZZ-B']);
  });

  it('ràng buộc tỷ lệ/kiểu dữ liệu', async () => {
    const res = await ctx.http.post(`/workspaces/${ws}/templates`).set(owner.auth).send(tpl({ aspectRatios: ['wide'], kind: 'gif' }));
    expect(res.status).toBe(400);
  });
});

describe('library: contents, phiên bản, thẻ, thư mục', () => {
  const mkContent = async (over: object = {}) => {
    const r = await ctx.http.post(`/workspaces/${ws}/contents`).set(owner.auth).send({ productId, kind: 'video', name: 'Serum 360', ...over });
    expect(r.status).toBe(201);
    return r.body as { id: string; seriesId: string; versionNo: number };
  };

  it('tạo -> cập nhật tiến độ/trạng thái -> hoàn tất; ready tự đặt 100%', async () => {
    const c = await mkContent();
    expect(c).toMatchObject({ versionNo: 1, status: 'rendering', progress: 0 });
    const mid = await ctx.http.patch(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).send({ progress: 68 });
    expect(mid.body).toMatchObject({ status: 'rendering', progress: 68 });
    const done = await ctx.http.patch(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).send({ status: 'ready', format: 'mp4', sizeBytes: 12_345_678, durationMs: 15000, width: 1080, height: 1920 });
    expect(done.body).toMatchObject({ status: 'ready', progress: 100, format: 'mp4', sizeBytes: 12_345_678, durationMs: 15000 });
    expect((await ctx.http.patch(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).send({ progress: 101 })).status).toBe(400);
    expect((await ctx.http.patch(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).send({ status: 'weird' })).status).toBe(400);
  });

  it('phiên bản V1/V2/V3 dùng chung series; latestOnly chỉ lấy bản mới nhất', async () => {
    const v1 = await mkContent({ name: 'Series Z', tags: ['sale'] });
    const v2 = await ctx.http.post(`/workspaces/${ws}/contents/${v1.id}/versions`).set(owner.auth);
    expect(v2.status).toBe(201);
    expect(v2.body).toMatchObject({ versionNo: 2, seriesId: v1.seriesId, status: 'rendering', tags: ['sale'], name: 'Series Z' });
    const v3 = await ctx.http.post(`/workspaces/${ws}/contents/${v2.body.id}/versions`).set(owner.auth);
    expect(v3.body.versionNo).toBe(3);
    const detail = await ctx.http.get(`/workspaces/${ws}/contents/${v1.id}`).set(owner.auth);
    expect(detail.body.versions.map((v: { versionNo: number }) => v.versionNo)).toEqual([1, 2, 3]);
    const latest = await ctx.http.get(`/workspaces/${ws}/contents?q=Series%20Z&latestOnly=true`).set(owner.auth);
    expect(latest.body.items.map((c: { versionNo: number }) => c.versionNo)).toEqual([3]);
    expect((await ctx.http.get(`/workspaces/${ws}/contents?q=Series%20Z`).set(owner.auth)).body.total).toBe(3);
  });

  it('tạo phiên bản song song không trùng số phiên bản', async () => {
    const v1 = await mkContent({ name: 'Race series' });
    const results = await Promise.all(Array.from({ length: 4 }, () => ctx.http.post(`/workspaces/${ws}/contents/${v1.id}/versions`).set(owner.auth)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.map((r) => r.body.versionNo).sort()).toEqual([2, 3, 4, 5]);
  });

  it('thẻ chuẩn hóa (trim, bỏ trùng), lọc theo thẻ, yêu thích, liệt kê thẻ', async () => {
    const c = await mkContent({ name: 'Tagged', tags: [' Sale ', 'sale', 'Tết', ''] });
    expect(c).toMatchObject({});
    const got = await ctx.http.get(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth);
    expect(got.body.tags).toEqual(['Sale', 'Tết']);
    await ctx.http.patch(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).send({ favorite: true }).expect(200);
    const byTag = await ctx.http.get(`/workspaces/${ws}/contents?tag=T%E1%BA%BFT&favorite=true`).set(owner.auth);
    expect(byTag.body.items.map((i: { id: string }) => i.id)).toEqual([c.id]);
    const tags = await ctx.http.get(`/workspaces/${ws}/tags`).set(owner.auth);
    expect(tags.body.map((t: { tag: string }) => t.tag)).toEqual(expect.arrayContaining(['Sale', 'Tết']));
  });

  it('thư mục: tạo lồng nhau, di chuyển nội dung, chống trùng tên và vòng lặp, xóa thư mục đưa nội dung về gốc', async () => {
    const parent = await ctx.http.post(`/workspaces/${ws}/folders`).set(owner.auth).send({ name: 'Chiến dịch Tết' });
    expect(parent.status).toBe(201);
    const child = await ctx.http.post(`/workspaces/${ws}/folders`).set(owner.auth).send({ name: 'Reels', parentId: parent.body.id });
    expect(child.body.parentId).toBe(parent.body.id);
    expect((await ctx.http.post(`/workspaces/${ws}/folders`).set(owner.auth).send({ name: 'chiến dịch tết' })).body.code).toBe('FOLDER_NAME_TAKEN');
    const cycle = await ctx.http.patch(`/workspaces/${ws}/folders/${parent.body.id}`).set(owner.auth).send({ parentId: child.body.id });
    expect(cycle.status).toBe(400);
    expect(cycle.body.code).toBe('FOLDER_CYCLE');

    const c = await mkContent({ name: 'In folder', folderId: child.body.id });
    expect((await ctx.http.get(`/workspaces/${ws}/contents?folderId=${child.body.id}`).set(owner.auth)).body.total).toBe(1);
    await ctx.http.patch(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).send({ folderId: parent.body.id }).expect(200);
    await ctx.http.delete(`/workspaces/${ws}/folders/${parent.body.id}`).set(owner.auth).expect(204);
    const after = await ctx.http.get(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth);
    expect(after.body.folderId).toBeNull();
    expect((await ctx.http.get(`/workspaces/${ws}/contents?folderId=root&q=In%20folder`).set(owner.auth)).body.total).toBe(1);

    const other = await register(ctx, { workspaceName: 'Folder other' });
    const foreign = await ctx.http.post(`/workspaces/${ws}/contents`).set(owner.auth).send({ productId, kind: 'image', name: 'x', folderId: (await ctx.http.post(`/workspaces/${other.workspaceId}/folders`).set(other.auth).send({ name: 'F' })).body.id });
    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('FOLDER_NOT_FOUND');
  });

  it('cô lập workspace và product phải thuộc workspace', async () => {
    const other = await register(ctx, { workspaceName: 'Isolated' });
    const c = await mkContent({ name: 'Secret' });
    expect((await ctx.http.get(`/workspaces/${other.workspaceId}/contents/${c.id}`).set(other.auth)).status).toBe(404);
    expect((await ctx.http.patch(`/workspaces/${other.workspaceId}/contents/${c.id}`).set(other.auth).send({ name: 'x' })).status).toBe(404);
    expect((await ctx.http.get(`/workspaces/${ws}/contents`).set(other.auth)).status).toBe(404);
    const crossProduct = await ctx.http.post(`/workspaces/${other.workspaceId}/contents`).set(other.auth).send({ productId, kind: 'image', name: 'x' });
    expect(crossProduct.status).toBe(404);
    expect(crossProduct.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('xóa mềm nội dung', async () => {
    const c = await mkContent({ name: 'To delete' });
    await ctx.http.delete(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth).expect(204);
    expect((await ctx.http.get(`/workspaces/${ws}/contents/${c.id}`).set(owner.auth)).status).toBe(404);
  });
});
