// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

const cards = () => screen.queryAllByTestId('template-card');

describe('Kho mẫu', () => {
  it('hiển thị lưới mẫu, phân trang và panel xem trước', async () => {
    renderApp('#/templates');
    await waitFor(() => expect(cards()).toHaveLength(6));
    expect(screen.getByTestId('pager-label')).toHaveTextContent('Hiển thị 6 / 18 mẫu');
    expect(await screen.findByTestId('preview-name')).toHaveTextContent('Thiên nhiên dịu nhẹ');
  });

  it('lọc theo tab Video, phong cách, ngành hàng và tỷ lệ', async () => {
    const { user } = renderApp('#/templates');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(screen.getByTestId('tab-video'));
    await waitFor(() => expect(screen.queryAllByTestId('template-badge').every((b) => /Video/.test(b.textContent ?? ''))).toBe(true));
    await user.click(screen.getByTestId('tab-all'));
    await user.click(screen.getByTestId('style-luxury'));
    await waitFor(() => expect(cards().length).toBeGreaterThan(0));
    expect(cards().length).toBeLessThanOrEqual(6);
    for (const c of cards()) expect(c.textContent).toMatch(/Mỹ phẩm/);
    await user.selectOptions(screen.getByTestId('aspect-select'), '9:16');
    await waitFor(() => expect(screen.getByTestId('pager-label')).toHaveTextContent('/ 2 mẫu'));
    await user.selectOptions(screen.getByTestId('industry-select'), 'Đồ uống');
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
  });

  it('chọn mẫu hiển thị xem trước; "Lưu mẫu" đưa mẫu vào tab Mẫu của tôi', async () => {
    const { user } = renderApp('#/templates');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(cards()[3]!);
    await waitFor(() => expect(screen.getByTestId('preview-name')).toHaveTextContent('Studio tối giản'));
    await user.click(screen.getByTestId('save-template'));
    await waitFor(() => expect(screen.getByTestId('save-template')).toHaveTextContent('Đã lưu mẫu'));
    await user.click(screen.getByTestId('tab-mine'));
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(cards()[0]).toHaveTextContent('Studio tối giản');
  });

  it('tab Mẫu của tôi trống hiển thị hướng dẫn', async () => {
    const { user } = renderApp('#/templates');
    await user.click(screen.getByTestId('tab-mine'));
    expect(await screen.findByTestId('empty-state')).toHaveTextContent('Bạn chưa lưu mẫu nào');
  });

  it('yêu thích một mẫu', async () => {
    const { user } = renderApp('#/templates');
    await waitFor(() => expect(cards()).toHaveLength(6));
    const fav = within(cards()[1]!).getByTestId('favorite');
    expect(fav).toHaveAttribute('aria-pressed', 'false');
    await user.click(fav);
    await waitFor(() => expect(within(cards()[1]!).getByTestId('favorite')).toHaveAttribute('aria-pressed', 'true'));
  });

  it('"Dùng mẫu này" mở Studio với mẫu và sản phẩm đã chọn', async () => {
    const { user } = renderApp('#/templates?product=bot-002');
    await waitFor(() => expect(cards()).toHaveLength(6));
    await user.click(cards()[0]!);
    await waitFor(() => expect(screen.getByTestId('preview-name')).toHaveTextContent('Thiên nhiên dịu nhẹ'));
    await user.click(screen.getByTestId('use-template'));
    await waitFor(() => expect(window.location.hash).toBe('#/studio?product=bot-002&template=tpl-nature-soft&mode=image'));
    expect(await screen.findByTestId('image-canvas')).toHaveAttribute('data-preset', 'nature');
  });
});
