import { describe, expect, it } from 'vitest';
import { RenderRequest } from '@aps/shared';
import {
  JsonLinesParser,
  buildFfmpegArgs,
  compileWorkerJob,
  estimateRemainingSeconds,
  frameFileName,
  overallProgress,
  parseFfmpegProgress,
} from '../src/index.js';

describe('compileWorkerJob', () => {
  it('video 5s@30fps -> 150 khung xoay 360 độ', () => {
    const req = RenderRequest.parse({ product: { glbPath: '/a.glb' }, output: { kind: 'video' } });
    const job = compileWorkerJob(req, { jobId: 'j1', framesDir: '/w/frames' });
    expect(job.frames).toEqual({ total: 150, angleStartDeg: 0, angleSpanDeg: 360 });
    expect(job.paths.framesDir).toBe('/w/frames');
  });

  it('ảnh -> 1 khung ở góc chỉ định, không xoay', () => {
    const req = RenderRequest.parse({ product: { glbPath: '/a.glb' }, output: { kind: 'image', stillAngleDeg: 30 } });
    const job = compileWorkerJob(req, { jobId: 'j1', framesDir: '/w/frames' });
    expect(job.frames).toEqual({ total: 1, angleStartDeg: 30, angleSpanDeg: 0 });
  });
});

describe('JsonLinesParser', () => {
  it('ghép dòng bị cắt giữa các chunk và giữ dòng thường dạng raw', () => {
    const p = new JsonLinesParser();
    const a = p.push('Blender 4.5\n{"type":"progress","phase":"render","fr');
    expect(a).toEqual([{ kind: 'raw', text: 'Blender 4.5' }]);
    const b = p.push('ame":2,"total":9}\n{"type":"log","message":"hi"}\r\nFra:1 Mem:4M');
    expect(b.map((x) => x.kind)).toEqual(['event', 'event']);
    expect(p.flush()).toEqual([{ kind: 'raw', text: 'Fra:1 Mem:4M' }]);
  });

  it('JSON sai schema bị coi là raw, không ném lỗi', () => {
    const [x] = new JsonLinesParser().push('{"type":"progress","frame":"x"}\n');
    expect(x?.kind).toBe('raw');
  });
});

describe('buildFfmpegArgs', () => {
  const base = { framesDir: '/w/frames', outputPath: '/w/out.mp4', fps: 30, width: 1280, height: 720, durationS: 5 };
  it('H.264 yuv420p faststart', () => {
    const args = buildFfmpegArgs(base);
    expect(args).toContain('libx264');
    expect(args).toContain('+faststart');
    expect(args).toContain('/w/frames/frame_%06d.png');
    expect(args.at(-1)).toBe('/w/out.mp4');
    expect(args).not.toContain('-filter_complex');
  });
  it('thêm overlay logo cuối video', () => {
    const args = buildFfmpegArgs({ ...base, logoPath: '/l.png' });
    const fc = args[args.indexOf('-filter_complex') + 1] ?? '';
    expect(fc).toContain('overlay');
    expect(fc).toContain('fade=t=in:st=3.800');
  });
  it('đọc tiến độ ffmpeg', () => {
    expect(parseFfmpegProgress('frame=42')).toBe(42);
    expect(parseFfmpegProgress('fps=30')).toBeNull();
  });
});

describe('progress', () => {
  it('tiến trình đơn điệu qua các trạng thái', () => {
    expect(overallProgress('queued', 0, 10)).toBe(0);
    expect(overallProgress('rendering', 5, 10)).toBeCloseTo(0.46);
    expect(overallProgress('rendering', 10, 10)).toBeCloseTo(0.92);
    expect(overallProgress('encoding', 10, 10, 5)).toBeCloseTo(0.96);
    expect(overallProgress('done', 10, 10)).toBe(1);
  });
  it('ước tính thời gian còn lại', () => {
    expect(estimateRemainingSeconds(10, 5, 15)).toBe(20);
    expect(estimateRemainingSeconds(0, 0, 15)).toBeNull();
  });
  it('tên file khung', () => {
    expect(frameFileName(7)).toBe('frame_000007.png');
  });
});
