import { WorkerJobV1, totalFramesFor, type RenderRequest } from '@aps/shared';

export const FRAME_PATTERN = 'frame_%06d.png';

export function frameFileName(frame: number): string {
  return `frame_${String(frame).padStart(6, '0')}.png`;
}

export interface CompileOptions {
  jobId: string;
  framesDir: string;
}

/** Biên dịch yêu cầu của UI (RenderRequest) thành job.json cho blender-worker. */
export function compileWorkerJob(request: RenderRequest, opts: CompileOptions): WorkerJobV1 {
  const { output, product, scene } = request;
  const total = totalFramesFor(output);
  const isImage = output.kind === 'image';
  return WorkerJobV1.parse({
    version: 1,
    mode: 'render',
    jobId: opts.jobId,
    product: {
      glbPath: product.glbPath,
      sizeMm: product.sizeMm,
      label: product.label,
    },
    scene: { template: scene.template, backgroundColor: scene.backgroundColor, shadow: scene.shadow },
    motion: output.motion,
    render: {
      engine: output.engine,
      samples: output.samples,
      width: output.width,
      height: output.height,
      device: output.device,
    },
    frames: {
      total,
      angleStartDeg: isImage ? output.stillAngleDeg : 0,
      // Khung cuối cách khung đầu (360 - 360/total) độ để vòng lặp liền mạch.
      angleSpanDeg: isImage ? 0 : 360,
    },
    paths: { framesDir: opts.framesDir, pattern: FRAME_PATTERN },
  });
}

export function compileSmokeJob(jobId: string, framesDir: string): WorkerJobV1 {
  return WorkerJobV1.parse({
    version: 1,
    mode: 'smoke',
    jobId,
    scene: { template: 'studio-soft', backgroundColor: '#cccccc', shadow: 0 },
    motion: 'orbit',
    render: { engine: 'cycles', samples: 1, width: 64, height: 64, device: 'cpu' },
    frames: { total: 1, angleStartDeg: 0, angleSpanDeg: 0 },
    paths: { framesDir, pattern: FRAME_PATTERN },
  });
}

export function blenderArgs(workerScript: string, jobJsonPath: string, extra: string[] = []): string[] {
  return [
    '-b',
    '-noaudio',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    workerScript,
    '--',
    jobJsonPath,
    ...extra,
  ];
}
