import { describe, expect, it } from 'vitest';
import { tarBinary } from '../src/orchestrator/runtime/extract.js';

describe('tarBinary: chọn công cụ giải nén', () => {
  it('Windows dùng bsdtar của hệ điều hành trong System32 (không dùng GNU tar của Git for Windows trong PATH)', () => {
    const p = tarBinary('win32', { SystemRoot: 'C:\\Windows' }, () => true);
    expect(p).toMatch(/System32.tar\.exe$/);
    expect(p.startsWith('C:\\Windows')).toBe(true);
  });
  it('Windows không có System32\\tar.exe thì lùi về `tar` trong PATH; Linux/macOS luôn `tar`', () => {
    expect(tarBinary('win32', {}, () => false)).toBe('tar');
    expect(tarBinary('linux', {}, () => true)).toBe('tar');
    expect(tarBinary('darwin', {}, () => true)).toBe('tar');
  });
});
