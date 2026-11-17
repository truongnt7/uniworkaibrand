// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

describe('Studio video 3D', () => {
  const open = async () => {
    const utils = renderApp('#/studio?product=bot-001&mode=video');
    await screen.findByTestId('video-canvas');
    return utils;
  };

  it('dựng bố cục 3 cột, stepper, timeline 3 track và Đạo diễn AI', async () => {
    await open();
    expect(screen.getByTestId('studio-title')).toHaveTextContent('Video sản phẩm 3D');
    expect(screen.getByTestId('stepper').querySelectorAll('li')).toHaveLength(4);
    expect(screen.getByTestId('step-3').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(document.querySelectorAll('.tl-row[data-track]')).toHaveLength(3);
    expect(screen.getAllByTestId('clip').map((c) => c.textContent)).toEqual(['Xoay 360°', 'Tiến gần', 'Quay quanh', 'Hiện dần']);
    expect(screen.getByTestId('time-readout')).toHaveTextContent('00:04 / 00:15');
    expect(screen.getByTestId('director-input')).toHaveAttribute('placeholder', expect.stringContaining('Xoay chai chậm'));
    expect(screen.getByTestId('lock-label')).toHaveAttribute('aria-checked', 'true');
  });

  it('tỷ lệ khung 16:9 / 9:16 / 1:1', async () => {
    const { user } = await open();
    expect(screen.getByTestId('video-canvas')).toHaveAttribute('data-aspect', '16:9');
    await user.click(screen.getByTestId('aspect-9:16'));
    expect(screen.getByTestId('video-canvas')).toHaveAttribute('data-aspect', '9:16');
    await user.click(screen.getByTestId('aspect-1:1'));
    expect(screen.getByTestId('video-canvas')).toHaveAttribute('data-aspect', '1:1');
  });

  it('bật/tắt thành phần cảnh ảnh hưởng khung xem trước', async () => {
    const { user } = await open();
    const canvas = () => within(screen.getByTestId('video-canvas'));
    expect(canvas().getByTestId('art-product')).toBeInTheDocument();
    await user.click(screen.getByTestId('toggle-product'));
    expect(canvas().queryByTestId('art-product')).not.toBeInTheDocument();
    expect(screen.getByTestId('component-product')).toHaveAttribute('data-visible', 'false');
    await user.click(screen.getByTestId('toggle-product'));
    expect(canvas().getByTestId('art-product')).toBeInTheDocument();
  });

  it('sửa thời lượng và easing của clip trên timeline', async () => {
    const { user } = await open();
    const orbit = screen.getAllByTestId('clip').find((c) => c.textContent === 'Quay quanh')!;
    await user.click(orbit);
    const inspector = screen.getByTestId('clip-inspector');
    expect(within(inspector).getByTestId('clip-start')).toHaveValue(6);
    fireEvent.change(within(inspector).getByTestId('clip-end'), { target: { value: '12' } });
    await waitFor(() => expect(screen.getAllByTestId('clip').find((c) => c.textContent === 'Quay quanh')).toHaveAttribute('data-end', '12'));
    await user.selectOptions(within(inspector).getByTestId('clip-ease'), 'linear');
    expect(screen.getAllByTestId('clip').find((c) => c.textContent === 'Quay quanh')).toHaveAttribute('data-ease', 'linear');
    expect(screen.getByTestId('easing-select')).toHaveValue('custom');
  });

  it('đổi thời lượng tổng co giãn timeline; đổi chuyển động dựng lại clip', async () => {
    const { user } = await open();
    await user.selectOptions(screen.getByTestId('duration-select'), '10');
    expect(screen.getByTestId('time-readout')).toHaveTextContent('/ 00:10');
    expect(screen.getAllByTestId('clip').every((c) => Number(c.dataset.end) <= 10)).toBe(true);
    await user.click(screen.getByTestId('motion-orbit'));
    expect(screen.getAllByTestId('clip').map((c) => c.textContent)).toEqual(['Đứng yên', 'Quay quanh', 'Hiện dần']);
    expect(screen.getByTestId('motion-lift')).toBeDisabled();
  });

  it('kéo thanh thời gian di chuyển playhead; logo hiện dần ở cuối', async () => {
    await open();
    expect(screen.queryByTestId('scene-logo')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('scrubber'), { target: { value: '14' } });
    expect(screen.getByTestId('time-readout')).toHaveTextContent('00:14 / 00:15');
    expect(screen.getByTestId('playhead')).toHaveAttribute('data-time', '14.0');
    expect(await screen.findByTestId('scene-logo')).toBeInTheDocument();
  });

  it('Đạo diễn AI (mock) cập nhật timeline từ prompt', async () => {
    const { user } = await open();
    await user.click(screen.getByTestId('motion-orbit'));
    await user.type(screen.getByTestId('director-input'), 'Xoay chai chậm 10 giây, kết thúc bằng logo');
    await user.click(screen.getByTestId('director-send'));
    await waitFor(() => expect(screen.getByTestId('time-readout')).toHaveTextContent('/ 00:10'));
    expect(screen.getAllByTestId('clip').map((c) => c.textContent)).toContain('Xoay 360°');
    expect(screen.getByTestId('speed-select')).toHaveValue('slow');
  });

  it('"Giữ nguyên nhãn sản phẩm" bật/tắt được', async () => {
    const { user } = await open();
    await user.click(screen.getByTestId('lock-label'));
    expect(screen.getByTestId('lock-label')).toHaveAttribute('aria-checked', 'false');
  });

  it('nút Xuất gửi yêu cầu vào dịch vụ xuất và hiển thị tiến độ', async () => {
    const { user } = await open();
    await user.selectOptions(screen.getByTestId('duration-select'), '5');
    await user.click(screen.getByTestId('export-button'));
    const status = await screen.findByTestId('export-status');
    expect(status).toHaveAttribute('data-mode', 'mock');
    await waitFor(() => expect(screen.getByTestId('export-status')).toHaveAttribute('data-status', 'done'), { timeout: 3000 });
    await user.click(screen.getByTestId('view-in-library'));
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/library\?item=/));
  });

  it('sản phẩm chỉ có ảnh hiển thị cảnh báo và khóa nút xuất video', async () => {
    renderApp('#/studio?product=bot-003&mode=video');
    expect(await screen.findByTestId('no-model-notice')).toBeInTheDocument();
    expect(screen.getByTestId('export-button')).toBeDisabled();
  });
});

describe('Studio ảnh', () => {
  const open = async () => {
    const utils = renderApp('#/studio?product=bot-001');
    await screen.findByTestId('image-canvas');
    return utils;
  };

  it('đổi preset cảnh, undo/redo', async () => {
    const { user } = await open();
    expect(screen.getByTestId('image-canvas')).toHaveAttribute('data-preset', 'nature');
    expect(screen.getByTestId('undo')).toBeDisabled();
    await user.click(screen.getByTestId('preset-minimal'));
    expect(screen.getByTestId('image-canvas')).toHaveAttribute('data-preset', 'minimal');
    await user.click(screen.getByTestId('undo'));
    expect(screen.getByTestId('image-canvas')).toHaveAttribute('data-preset', 'nature');
    await user.click(screen.getByTestId('redo'));
    expect(screen.getByTestId('image-canvas')).toHaveAttribute('data-preset', 'minimal');
  });

  it('đổ bóng 70% mặc định, kéo thanh trượt và đổi tỷ lệ/zoom', async () => {
    const { user } = await open();
    expect(screen.getByTestId('shadow-value')).toHaveTextContent('70%');
    fireEvent.change(screen.getByTestId('shadow-slider'), { target: { value: '30' } });
    expect(screen.getByTestId('shadow-value')).toHaveTextContent('30%');
    await user.click(screen.getByTestId('aspect-4:5'));
    expect(screen.getByTestId('image-canvas')).toHaveAttribute('data-aspect', '4:5');
    await user.click(screen.getByTestId('zoom-in'));
    expect(screen.getByTestId('zoom-value')).toHaveTextContent('125%');
  });

  it('prompt "Bạn muốn thay đổi điều gì?" áp dụng bối cảnh và giữ nguyên nhãn', async () => {
    const { user } = await open();
    await user.click(screen.getByTestId('lock-label'));
    await user.type(screen.getByTestId('director-input'), 'Đổi nền cao cấp, ánh sáng mềm');
    await user.click(screen.getByTestId('director-send'));
    await waitFor(() => expect(screen.getByTestId('image-canvas')).toHaveAttribute('data-preset', 'luxury'));
    expect(screen.getByTestId('light-select')).toHaveValue('soft');
    expect(screen.getByTestId('lock-label')).toHaveAttribute('aria-checked', 'true');
  });

  it('chip "Gợi ý ý tưởng" điền prompt, "Thêm đạo cụ" bị khóa (V1)', async () => {
    const { user } = await open();
    await user.click(screen.getByTestId('chip-ideas'));
    await waitFor(() => expect((screen.getByTestId('director-input') as HTMLInputElement).value).not.toBe(''));
    expect(screen.getByTestId('chip-props')).toBeDisabled();
  });

  it('đổi sản phẩm bằng hộp chọn và xuất ảnh vào thư viện', async () => {
    const { user, services } = await open();
    await user.click(screen.getByTestId('change-product'));
    const picker = await screen.findByTestId('product-picker');
    await user.click(within(picker).getAllByTestId('picker-item').find((i) => i.dataset.id === 'bot-002')!);
    await waitFor(() => expect(screen.getByTestId('studio-product-name')).toHaveTextContent('Kem dưỡng ban đêm'));
    await user.click(screen.getByTestId('export-button'));
    const status = await screen.findByTestId('export-status');
    expect(status).toBeInTheDocument();
    const list = await services.library.list({ search: 'Kem_dưỡng_ban_đêm' });
    expect(list.items[0]?.kind).toBe('image');
  });
});
