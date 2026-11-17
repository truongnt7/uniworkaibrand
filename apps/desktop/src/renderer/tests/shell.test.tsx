// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from './helpers';

describe('App shell', () => {
  it('hiển thị sidebar tiếng Việt với 7 mục (Tạo video đứng đầu rồi 6 mục theo thiết kế)', async () => {
    renderApp('#/');
    const nav = await screen.findByRole('navigation', { name: 'Điều hướng chính' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(labels).toEqual(['Tạo video', 'Tổng quan', 'Sản phẩm', 'Studio sáng tạo', 'Kho mẫu', 'Thư viện', 'Chuẩn bị đăng thủ công']);
    expect(document.documentElement.lang).toBe('vi');
  });

  it('điều hướng bằng sidebar và đánh dấu mục đang mở', async () => {
    const { user } = renderApp('#/');
    await user.click(screen.getByTestId('nav-library'));
    expect(await screen.findByTestId('page-library')).toBeInTheDocument();
    expect(screen.getByTestId('nav-library')).toHaveAttribute('aria-current', 'page');
    await user.click(screen.getByTestId('nav-templates'));
    expect(await screen.findByTestId('page-templates')).toBeInTheDocument();
    expect(screen.getByTestId('nav-library')).not.toHaveAttribute('aria-current');
  });

  it('workspace switcher đổi không gian làm việc', async () => {
    const { user } = renderApp('#/');
    const trigger = screen.getByTestId('workspace-switcher');
    await waitFor(() => expect(trigger).toHaveTextContent('UNICOM Workspace'));
    await user.click(trigger);
    await user.click(await screen.findByTestId('workspace-ws-botanic'));
    await waitFor(() => expect(trigger).toHaveTextContent('BOTANIC Việt Nam'));
    expect(screen.queryByTestId('workspace-menu')).not.toBeInTheDocument();
  });

  it('đổi ngôn ngữ vi <-> en không cần build lại', async () => {
    const { user } = renderApp('#/');
    await user.click(screen.getByTestId('user-menu'));
    await user.click(screen.getByTestId('locale-en'));
    expect(await screen.findByTestId('nav-products')).toHaveTextContent('Products');
    expect(document.documentElement.lang).toBe('en');
    await user.click(screen.getByTestId('user-menu'));
    await user.click(screen.getByTestId('locale-vi'));
    expect(await screen.findByTestId('nav-products')).toHaveTextContent('Sản phẩm');
  });

  it('PoC Console vẫn truy cập được ở #/poc', async () => {
    (window as unknown as { aps: unknown }).aps = {
      invoke: async (channel: string) =>
        channel === 'runtime:status' ? { installed: false, version: null, binaryPath: null, platform: 'linux-x64', busy: false } : [],
      on: () => () => undefined,
    };
    renderApp('#/poc');
    expect(await screen.findByTestId('poc-page')).toBeInTheDocument();
    expect(screen.getByTestId('nav-poc')).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByTestId('job-form')).toBeInTheDocument();
    delete (window as unknown as { aps?: unknown }).aps;
  });
});
