import { applyMotion, defaultImageScene, setDuration, validateTimeline } from '../timeline';
import type { DirectorResult, DirectorService, ImageScene, MotionPreset, SpeedPreset, TimelineDoc } from '../types';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

/**
 * Đạo diễn AI (mock, theo từ khoá): prompt -> timeline JSON hợp lệ.
 * Bản thật gọi AI Gateway, nhưng vẫn phải đi qua validateTimeline trước khi áp dụng.
 */
export class MockDirectorService implements DirectorService {
  async directVideo(prompt: string, current: TimelineDoc): Promise<DirectorResult> {
    const text = norm(prompt);
    let motion: MotionPreset = current.motion;
    // Preset "xoay 360°" đã gồm camera tiến gần rồi quay quanh nên được ưu tiên khi prompt nhắc xoay.
    if (has(text, 'xoay', 'spin')) motion = 'spin360';
    else if (has(text, 'quay quanh', 'orbit')) motion = 'orbit';
    else if (has(text, 'tien gan', 'dolly')) motion = 'dollyIn';

    let speed: SpeedPreset = current.speed;
    if (has(text, 'cham')) speed = 'slow';
    else if (has(text, 'nhanh')) speed = 'fast';

    let doc = applyMotion(current, motion);
    const seconds = /(\d{1,2})\s*(giay|s\b)/.exec(text);
    if (seconds) doc = setDuration(doc, Number(seconds[1]));
    const aspect = has(text, '9:16', 'doc') ? '9:16' : has(text, '1:1', 'vuong') ? '1:1' : has(text, '16:9', 'ngang') ? '16:9' : doc.aspect;
    doc = { ...doc, speed, aspect, lockLabel: true };

    if (has(text, 'khong logo', 'bo logo')) doc = { ...doc, hidden: [...new Set([...doc.hidden, 'logo' as const])] };
    else if (has(text, 'logo')) doc = { ...doc, hidden: doc.hidden.filter((h) => h !== 'logo') };

    if (validateTimeline(doc).length > 0) doc = applyMotion(current, current.motion);
    return { timeline: doc, summary: `${motion}|${speed}|${doc.durationS}|${doc.aspect}` };
  }

  async directImage(prompt: string, current: ImageScene): Promise<{ scene: ImageScene; summary: string }> {
    const text = norm(prompt);
    const base = defaultImageScene();
    let scene: ImageScene = { ...current, lockLabel: true };
    if (has(text, 'thien nhien', 'sage', 'xanh')) scene = { ...scene, preset: 'nature', backgroundColor: base.backgroundColor };
    else if (has(text, 'toi gian', 'minimal')) scene = { ...scene, preset: 'minimal', backgroundColor: '#f5efe2' };
    else if (has(text, 'cao cap', 'sang trong')) scene = { ...scene, preset: 'luxury', backgroundColor: '#ecd3b5' };
    else if (has(text, 'studio')) scene = { ...scene, preset: 'studio', backgroundColor: '#e7e4dd' };
    if (has(text, 'tu nhien')) scene = { ...scene, light: 'natural' };
    else if (has(text, 'kich tinh', 'tuong phan')) scene = { ...scene, light: 'dramatic' };
    else if (has(text, 'mem')) scene = { ...scene, light: 'soft' };
    return { scene, summary: scene.preset };
  }

  async suggestIdeas(): Promise<string[]> {
    return ['Xoay chai chậm, camera tiến gần, kết thúc bằng logo', 'Nền xanh sage, ánh sáng tự nhiên', 'Studio tối giản, bóng mềm'];
  }
}
