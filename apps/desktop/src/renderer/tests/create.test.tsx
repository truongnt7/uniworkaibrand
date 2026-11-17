// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getTemplate, templatesFor } from '@aps/templates';
import { FakeCreateService } from './fakeCreate';
import { renderApp } from './helpers';

const template = templatesFor('ban-hang-online')[0]!;
const requiredPhotos = template.photos.filter((p) => p.required);

async function fillValid(fake: FakeCreateService, user: ReturnType<typeof renderApp>['user']) {
  for (const f of template.fields.filter((x) => x.required)) {
    const value = f.key === 'phone' ? '0901234567' : f.key === 'price' ? '199k' : 'Giá trị thử';
    await user.type(screen.getByTestId(`field-${f.key}`), value);
  }
  fake.picks.photo = requiredPhotos.map((_, i) => `/anh/san-pham-${i}.jpg`);
  for (const p of requiredPhotos) await user.click(screen.getByTestId(`photo-pick-${p.id}`));
}

describe('Màn hình Tạo video', () => {
  it('trạng thái rỗng: chưa chọn ngành thì hướng dẫn, nút Tạo video tắt và có chú thích', async () => {
    const fake = new FakeCreateService();
    renderApp('#/create', { create: fake });
    expect(await screen.findByTestId('empty-hint')).toHaveTextContent('Chọn ngành của bạn để bắt đầu.');
    expect(screen.getByTestId('create-button')).toBeDisabled();
    expect(screen.getByTestId('preview-panel')).toHaveAttribute('data-state', 'empty');
    expect(screen.getByTestId('target-cloud')).toBeDisabled();
    expect(screen.getByText('Sắp có')).toBeInTheDocument();
    expect(screen.getByTestId('queue-empty')).toBeInTheDocument();
  });

  it('chọn ngành tự chọn mẫu đầu, liệt kê phần còn thiếu bằng tiếng Việt và mở nút khi đủ', async () => {
    const fake = new FakeCreateService();
    const { user } = renderApp('#/create', { create: fake });
    await user.click(await screen.findByTestId('industry-ban-hang-online'));
    expect(screen.getByTestId(`template-${template.id}`)).toHaveAttribute('aria-checked', 'true');
    const missing = screen.getByTestId('missing-list');
    expect(missing).toHaveTextContent('Còn thiếu:');
    for (const f of template.fields.filter((x) => x.required)) expect(missing).toHaveTextContent(f.label);
    expect(screen.getByTestId('create-button')).toBeDisabled();
    await fillValid(fake, user);
    await waitFor(() => expect(screen.getByTestId('create-button')).toBeEnabled());
    expect(screen.queryByTestId('missing-list')).toBeNull();
  });

  it('SĐT sai báo lỗi dễ hiểu khi rời ô; nhập đúng thì tự định dạng', async () => {
    const fake = new FakeCreateService();
    const { user } = renderApp('#/create', { create: fake });
    await user.click(await screen.findByTestId('industry-ban-hang-online'));
    const phone = screen.getByTestId('field-phone');
    await user.type(phone, '123');
    await user.tab();
    expect(await screen.findByTestId('field-phone-error')).toHaveTextContent('Số điện thoại chưa đúng');
    await user.clear(phone);
    await user.type(phone, '0901234567');
    await user.tab();
    await waitFor(() => expect(screen.queryByTestId('field-phone-error')).toBeNull());
    expect(phone).toHaveValue('0901 234 567');
  });

  it('ảnh HEIC bị chặn kèm hướng dẫn chuyển sang JPG', async () => {
    const fake = new FakeCreateService();
    const { user } = renderApp('#/create', { create: fake });
    await user.click(await screen.findByTestId('industry-ban-hang-online'));
    const slot = requiredPhotos[0]!;
    fake.picks.photo = ['/anh/iphone.HEIC'];
    await user.click(screen.getByTestId(`photo-pick-${slot.id}`));
    expect(await screen.findByTestId(`photo-error-${slot.id}`)).toHaveTextContent('HEIC');
  });

  it('tạo video: xếp hàng, chạy, lỗi -> thử lại, hủy -> thử lại, xong -> xem, lưu, mở thư mục', async () => {
    const fake = new FakeCreateService();
    const { user } = renderApp('#/create', { create: fake });
    await user.click(await screen.findByTestId('industry-ban-hang-online'));
    await fillValid(fake, user);
    await waitFor(() => expect(screen.getByTestId('create-button')).toBeEnabled());
    await user.click(screen.getByTestId('create-button'));
    await waitFor(() => expect(fake.created).toHaveLength(1));
    expect(fake.created[0]).toMatchObject({ templateId: template.id, quality: 'preview', target: 'local' });
    const panel = screen.getByTestId('preview-panel');
    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'running'));
    expect(screen.getByTestId('queue-item')).toHaveAttribute('data-status', 'queued');

    act(() => fake.patch('job-1', { status: 'encoding', progress: 0.4 }));
    await waitFor(() => expect(screen.getByTestId('preview-progress')).toHaveAttribute('aria-valuenow', '40'));

    act(() => fake.patch('job-1', { status: 'failed', errorCode: 'SLIDESHOW_PHOTO_MISSING', errorMessage: 'ENOENT x.jpg' }));
    const err = await screen.findByTestId('preview-error');
    expect(err).toHaveTextContent('Chưa tạo được video');
    expect(err).not.toHaveTextContent('SLIDESHOW_PHOTO_MISSING');
    await user.click(screen.getByTestId('preview-details-toggle'));
    expect(screen.getByTestId('preview-details')).toHaveTextContent('ENOENT x.jpg');
    await user.click(screen.getByTestId('preview-retry'));
    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'running'));

    await user.click(screen.getByTestId('preview-cancel'));
    expect(await screen.findByTestId('preview-canceled')).toHaveTextContent('Thông tin bạn nhập vẫn còn nguyên');
    expect(screen.getByTestId(`field-${template.fields[0]!.key}`)).not.toHaveValue('');
    await user.click(screen.getByTestId('preview-retry'));
    await waitFor(() => expect(panel).toHaveAttribute('data-state', 'running'));

    act(() => fake.patch('job-1', { status: 'done', progress: 1 }));
    expect(await screen.findByTestId('preview-video')).toHaveAttribute('src', 'asset://job/job-1/output');
    expect(screen.getByTestId('save-button')).toBeEnabled();

    await user.click(screen.getByTestId('save-button'));
    await waitFor(() => expect(fake.created).toHaveLength(2));
    expect(fake.created[1]).toMatchObject({ quality: 'final' });
    expect(screen.getByTestId('preview-panel')).toHaveAttribute('data-state', 'running');
    act(() => fake.patch('job-2', { status: 'done', progress: 1 }));
    const status = await screen.findByTestId('save-status');
    expect(status).toHaveTextContent('job-2.mp4');
    expect(fake.saved).toEqual(['job-2']);
    await user.click(within(status).getByTestId('open-folder'));
  });

  it('sửa thông tin sau khi có video: báo bản xem trước đã cũ', async () => {
    const fake = new FakeCreateService();
    const { user } = renderApp('#/create', { create: fake });
    await user.click(await screen.findByTestId('industry-ban-hang-online'));
    await fillValid(fake, user);
    await waitFor(() => expect(screen.getByTestId('create-button')).toBeEnabled());
    await user.click(screen.getByTestId('create-button'));
    await waitFor(() => expect(fake.created).toHaveLength(1));
    act(() => fake.patch('job-1', { status: 'done', progress: 1 }));
    await screen.findByTestId('preview-video');
    expect(screen.queryByTestId('preview-stale')).toBeNull();
    await user.type(screen.getByTestId('field-businessName'), ' mới');
    expect(await screen.findByTestId('preview-stale')).toBeInTheDocument();
  });

  it('sao chép chữ đăng kèm cho từng kênh, có thể sửa trước khi chép', async () => {
    const fake = new FakeCreateService();
    const { user } = renderApp('#/create', { create: fake });
    await user.click(await screen.findByTestId('industry-ban-hang-online'));
    await fillValid(fake, user);
    const text = await screen.findByTestId('caption-text');
    await waitFor(() => expect((text as HTMLTextAreaElement).value).toContain('Giá trị thử'));
    await user.click(screen.getByTestId('caption-tab-zalo'));
    const zalo = screen.getByTestId('caption-text') as HTMLTextAreaElement;
    await user.type(zalo, ' (đã sửa)');
    await user.click(screen.getByTestId('caption-copy'));
    expect(fake.clipboard).toHaveLength(1);
    expect(fake.clipboard[0]).toContain('(đã sửa)');
    expect(await screen.findByText(/Đã sao chép chữ cho Zalo/)).toBeInTheDocument();
  });

  it('nhớ thông tin cơ sở: lưu khi nhập, tự điền lần mở sau, xóa được', async () => {
    const fake = new FakeCreateService();
    fake.profile = { businessName: 'Cửa hàng Hoa Mai', phone: '0901 234 567', address: '12 Lê Lợi, Quận 1', industry: 'ban-hang-online', templateId: template.id };
    const { user } = renderApp('#/create', { create: fake });
    expect(await screen.findByTestId('field-businessName')).toHaveValue('Cửa hàng Hoa Mai');
    expect(screen.getByTestId('field-phone')).toHaveValue('0901 234 567');
    expect(screen.getByTestId(`template-${template.id}`)).toHaveAttribute('aria-checked', 'true');
    await user.type(screen.getByTestId('field-businessName'), ' 2');
    await waitFor(() => expect(fake.profile.businessName).toBe('Cửa hàng Hoa Mai 2'), { timeout: 2000 });
    await user.click(screen.getByTestId('forget-profile'));
    await waitFor(() => expect(fake.profile).toEqual({}));
    expect(screen.getByTestId('create-button')).toBeDisabled();
  });

  it('hàng đợi hiện trạng thái tiếng Việt và việc cloud chỉ là "sắp có"', async () => {
    const fake = new FakeCreateService();
    const { job } = await fake.create({ templateId: template.id, input: { values: {}, photos: {}, captions: {} }, name: 'Video cloud', quality: 'final' });
    fake.patch(job.id, { target: 'cloud' });
    renderApp('#/create', { create: fake });
    const item = await screen.findByTestId('queue-item');
    expect(item).toHaveTextContent('Chờ chạy trên Cloud (sắp có)');
  });

  it('thiếu thành phần dựng video thì hiện hướng dẫn cài', async () => {
    const fake = new FakeCreateService();
    fake.runtime = { installed: false, ffmpegPath: null } as unknown as typeof fake.runtime;
    renderApp('#/create', { create: fake });
    expect(await screen.findByTestId('runtime-banner')).toHaveTextContent('Cần cài thành phần dựng video');
    expect(getTemplate(template.id)).toBeDefined();
  });
});
