import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BusinessProfile, CaptionResult, InputIssue, JobRecord, SlideshowCreateReqInput } from '@aps/shared';
import { isSlideshowRequest, slideshowDurationS } from '@aps/shared';
import { INDUSTRIES, formatPhone, getTemplate, normalizePhone, normalizePrice, templatesFor, type Aspect, type FieldKey, type Industry, type Template } from '@aps/templates';
import type { CreateService } from '../../services/create';

export interface FormState {
  industry: Industry | null;
  templateId: string | null;
  aspect: Aspect | null;
  values: Partial<Record<FieldKey, string>>;
  photos: Record<string, string>;
  captions: Record<string, string>;
  logoPath: string | null;
  musicPath: string | null;
}

const EMPTY_FORM: FormState = { industry: null, templateId: null, aspect: null, values: {}, photos: {}, captions: {}, logoPath: null, musicPath: null };

const isIndustry = (v: unknown): v is Industry => typeof v === 'string' && (INDUSTRIES as readonly string[]).includes(v);

export function buildRequest(form: FormState, quality: 'preview' | 'final'): SlideshowCreateReqInput | null {
  if (!form.templateId) return null;
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(form.values)) if (v && v.trim()) values[k] = v.trim();
  return {
    templateId: form.templateId,
    quality,
    target: 'local',
    ...(form.aspect ? { aspect: form.aspect } : {}),
    input: { values, photos: { ...form.photos }, captions: Object.fromEntries(Object.entries(form.captions).filter(([, v]) => v.trim())) },
    ...(form.logoPath ? { logoPath: form.logoPath } : {}),
    ...(form.musicPath ? { musicPath: form.musicPath } : {}),
  };
}

/** Khoá nội dung (không gồm chất lượng): đổi khoá nghĩa là bản xem trước đã cũ. */
export function contentKey(form: FormState): string {
  const req = buildRequest(form, 'final');
  return req ? JSON.stringify({ ...req, quality: undefined }) : '';
}

export function missingItems(template: Template | null, form: FormState): string[] {
  if (!template) return [];
  const out: string[] = [];
  for (const f of template.fields) if (f.required && !form.values[f.key]?.trim()) out.push(f.label);
  for (const p of template.photos) if (p.required && !form.photos[p.id]) out.push(p.label);
  return out;
}

export function templateSeconds(t: Template): number {
  const scenes = t.scenes.map((s, i) => ({ durationS: s.durationS, transition: i === 0 ? ('none' as const) : (s.transition ?? ('fade' as const)), transitionS: s.transitionS ?? 0.5 }));
  return Math.round(slideshowDurationS({ scenes }));
}

export interface Validation {
  ok: boolean;
  issues: InputIssue[];
  warnings: InputIssue[];
}

export function useJobs(service: CreateService): JobRecord[] {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  useEffect(() => {
    let alive = true;
    void service.jobsList().then((list) => alive && setJobs((prev) => mergeJobs(list, prev)));
    const off = service.onJobChanged((job) => setJobs((prev) => mergeJobs([job], prev)));
    return () => {
      alive = false;
      off();
    };
  }, [service]);
  return jobs;
}

function mergeJobs(incoming: JobRecord[], prev: JobRecord[]): JobRecord[] {
  const map = new Map(prev.map((j) => [j.id, j]));
  for (const j of incoming) {
    const old = map.get(j.id);
    if (!old || j.updatedAt >= old.updatedAt) map.set(j.id, j);
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function useCreateFlow(service: CreateService) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [validation, setValidation] = useState<Validation>({ ok: false, issues: [], warnings: [] });
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const [captions, setCaptions] = useState<CaptionResult[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState('');
  const [viewJobId, setViewJobId] = useState<string | null>(null);
  const [finalJob, setFinalJob] = useState<{ id: string; key: string } | null>(null);
  const [savingFlag, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ path: string; name: string; jobId: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const jobs = useJobs(service);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const template = form.templateId ? (getTemplate(form.templateId) ?? null) : null;
  const key = contentKey(form);
  const missing = missingItems(template, form);

  useEffect(() => {
    let alive = true;
    void service
      .profileGet()
      .then((p: BusinessProfile) => {
        if (!alive) return;
        setForm((f) => {
          const industry = isIndustry(p.industry) ? p.industry : null;
          const tpl = industry ? templatesFor(industry) : [];
          const templateId = tpl.find((t) => t.id === p.templateId)?.id ?? tpl[0]?.id ?? null;
          return {
            ...f,
            industry,
            templateId,
            values: { ...(p.businessName ? { businessName: p.businessName } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.address ? { address: p.address } : {}), ...f.values },
            logoPath: p.logoPath ?? f.logoPath,
          };
        });
      })
      .catch(() => undefined)
      .finally(() => alive && setProfileLoaded(true));
    return () => {
      alive = false;
    };
  }, [service]);

  const profileKey = JSON.stringify([form.values.businessName ?? '', form.values.phone ?? '', form.values.address ?? '', form.logoPath, form.industry, form.templateId]);
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    if (!profileLoaded) return;
    if (lastSaved.current === null) {
      lastSaved.current = profileKey;
      return;
    }
    if (lastSaved.current === profileKey) return;
    const id = setTimeout(() => {
      lastSaved.current = profileKey;
      void service
        .profileSet({
          businessName: form.values.businessName?.trim() || null,
          phone: form.values.phone?.trim() || null,
          address: form.values.address?.trim() || null,
          industry: form.industry,
          templateId: form.templateId,
        })
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey, profileLoaded, service]);

  const requestedThumbs = useRef(new Set<string>());
  useEffect(() => {
    const paths = [...Object.values(form.photos), ...(form.logoPath ? [form.logoPath] : [])];
    for (const p of paths) {
      if (requestedThumbs.current.has(p)) continue;
      requestedThumbs.current.add(p);
      void service
        .thumbnail(p)
        .then((r) => setThumbs((t) => ({ ...t, [p]: r.dataUrl })))
        .catch(() => undefined);
    }
  }, [form.photos, form.logoPath, service]);

  useEffect(() => {
    const req = buildRequest(form, 'preview');
    if (!req) return;
    let alive = true;
    const id = setTimeout(() => {
      void service
        .validate(req)
        .then((v) => alive && setValidation(v))
        .catch(() => undefined);
    }, 200);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, service]);

  useEffect(() => {
    const req = buildRequest(form, 'preview');
    if (!req || !validation.ok) return;
    let alive = true;
    const id = setTimeout(() => {
      void service
        .captions({ templateId: req.templateId, input: req.input })
        .then((c) => alive && setCaptions(c))
        .catch(() => undefined);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, validation.ok, service]);

  const touch = useCallback((field: string) => setTouched((s) => (s.has(field) ? s : new Set(s).add(field))), []);

  const setIndustry = useCallback((industry: Industry) => {
    setForm((f) => {
      if (f.industry === industry) return f;
      const first = templatesFor(industry)[0];
      return { ...f, industry, templateId: first?.id ?? null, aspect: null, photos: remapPhotos(f, first ?? null), captions: {} };
    });
  }, []);

  const setTemplate = useCallback((id: string) => {
    setForm((f) => {
      const next = getTemplate(id);
      if (!next || f.templateId === id) return f;
      return { ...f, templateId: id, aspect: null, photos: remapPhotos(f, next), captions: {} };
    });
  }, []);

  const setAspect = useCallback((aspect: Aspect) => setForm((f) => ({ ...f, aspect })), []);
  const setValue = useCallback((k: FieldKey, v: string) => setForm((f) => ({ ...f, values: { ...f.values, [k]: v } })), []);
  const blurValue = useCallback(
    (k: FieldKey) => {
      touch(k);
      setForm((f) => {
        const raw = f.values[k]?.trim() ?? '';
        if (!raw) return f;
        if (k === 'phone') {
          const d = normalizePhone(raw);
          if (d) return { ...f, values: { ...f.values, phone: formatPhone(d) } };
        } else if (k === 'price') {
          const p = normalizePrice(raw);
          if (p.ok) return { ...f, values: { ...f.values, price: p.value } };
        }
        return f;
      });
    },
    [touch],
  );

  const setPhoto = useCallback((slot: string, path: string | null) => {
    setForm((f) => {
      const photos = { ...f.photos };
      if (path) photos[slot] = path;
      else delete photos[slot];
      return { ...f, photos };
    });
  }, []);
  const pickPhoto = useCallback(
    async (slot: string) => {
      const path = await service.pick('photo');
      if (path) setPhoto(slot, path);
    },
    [service, setPhoto],
  );
  const dropPhoto = useCallback(
    (slot: string, file: File) => {
      const path = service.pathForFile(file);
      if (path) setPhoto(slot, path);
    },
    [service, setPhoto],
  );
  const setCaption = useCallback((slot: string, v: string) => setForm((f) => ({ ...f, captions: { ...f.captions, [slot]: v } })), []);

  const pickLogo = useCallback(async () => {
    const path = await service.pick('logo');
    if (!path) return;
    try {
      const saved = await service.profileSet({ logoPath: path });
      setForm((f) => ({ ...f, logoPath: saved.logoPath ?? path }));
    } catch (e) {
      setError({ code: (e as { code?: string }).code ?? 'UNKNOWN', message: e instanceof Error ? e.message : String(e) });
    }
  }, [service]);
  const removeLogo = useCallback(async () => {
    setForm((f) => ({ ...f, logoPath: null }));
    await service.profileSet({ logoPath: null }).catch(() => undefined);
  }, [service]);
  const pickMusic = useCallback(async () => {
    const path = await service.pick('audio');
    if (path) setForm((f) => ({ ...f, musicPath: path }));
  }, [service]);
  const removeMusic = useCallback(() => setForm((f) => ({ ...f, musicPath: null })), []);

  const forgetProfile = useCallback(async () => {
    await service.profileSet({ businessName: null, phone: null, address: null, logoPath: null, industry: null, templateId: null });
    lastSaved.current = null;
    setForm(EMPTY_FORM);
    setTouched(new Set());
    setSubmitted(false);
  }, [service]);

  const shownJob = (viewJobId ? jobById.get(viewJobId) : previewJobId ? jobById.get(previewJobId) : undefined) ?? null;
  const finalRecord = finalJob ? (jobById.get(finalJob.id) ?? null) : null;
  const finalFailed = finalRecord ? ['failed', 'canceled', 'needs_attention'].includes(finalRecord.status) : false;
  const saving = savingFlag && !finalFailed;
  const stale = Boolean(previewJobId && !viewJobId && previewKey && previewKey !== key);

  const issueFor = useCallback(
    (field: string): InputIssue | null => {
      const hit = validation.issues.find((i) => i.field === field);
      if (!hit) return null;
      const alwaysShown = hit.code !== 'required' && hit.code !== 'photo_missing';
      return submitted || touched.has(field) || alwaysShown ? hit : null;
    },
    [validation.issues, submitted, touched],
  );
  const visibleIssues = validation.issues.filter((i) => submitted || touched.has(i.field) || (i.code !== 'required' && i.code !== 'photo_missing'));

  const create = useCallback(async (): Promise<boolean> => {
    setSubmitted(true);
    setError(null);
    setSaved(null);
    setSaveError(false);
    if (missingItems(template, form).length > 0) return false;
    const req = buildRequest(form, 'preview');
    if (!req) return false;
    try {
      const v = await service.validate(req);
      setValidation(v);
      if (!v.ok) return false;
      const res = await service.create(req);
      setPreviewJobId(res.job.id);
      setPreviewKey(contentKey(form));
      setViewJobId(null);
      setFinalJob(null);
      setSaving(false);
      return true;
    } catch (e) {
      setError({ code: (e as { code?: string }).code ?? 'UNKNOWN', message: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }, [form, service, template]);

  const doSave = useCallback(
    async (job: JobRecord) => {
      try {
        const path = await service.saveVideo(job.id, job.name);
        setSaving(false);
        if (path) {
          setSaved({ path, name: path.split(/[\\/]/).pop() ?? path, jobId: job.id });
          setSaveError(false);
        }
      } catch {
        setSaving(false);
        setSaveError(true);
      }
    },
    [service],
  );

  /** Lưu: job đang xem đã là bản đầy đủ (hoặc video 3D) thì lưu luôn; nếu mới có bản xem trước thì dựng bản 1080 trước. */
  const save = useCallback(async () => {
    setSaveError(false);
    const job = shownJob;
    if (!job || job.status !== 'done') return;
    const request = job.request;
    const isPreviewQuality = isSlideshowRequest(request) && request.quality === 'preview';
    if (!isPreviewQuality) {
      setSaving(true);
      await doSave(job);
      return;
    }
    if (finalJob && finalJob.key === key && finalRecord && finalRecord.status === 'done') {
      setSaving(true);
      await doSave(finalRecord);
      return;
    }
    const req = buildRequest(form, 'final');
    if (!req) return;
    setSaving(true);
    try {
      const res = await service.create({ ...req, name: job.name });
      setFinalJob({ id: res.job.id, key });
    } catch {
      setSaving(false);
      setSaveError(true);
    }
  }, [doSave, finalJob, finalRecord, form, key, service, shownJob]);

  const savedFinal = useRef<string | null>(null);
  useEffect(() => {
    if (!saving || !finalRecord || !finalJob) return;
    if (finalRecord.status === 'done' && savedFinal.current !== finalRecord.id) {
      savedFinal.current = finalRecord.id;
      void doSave(finalRecord);
    }
  }, [doSave, finalJob, finalRecord, saving]);

  const view = useCallback((id: string | null) => setViewJobId(id), []);

  return {
    form,
    template,
    profileLoaded,
    missing,
    validation,
    visibleIssues,
    issueFor,
    touch,
    submitted,
    thumbs,
    captions,
    error,
    jobs,
    shownJob,
    finalRecord,
    saving,
    saved,
    saveError,
    stale,
    key,
    setIndustry,
    setTemplate,
    setAspect,
    setValue,
    blurValue,
    pickPhoto,
    dropPhoto,
    setPhoto,
    setCaption,
    pickLogo,
    removeLogo,
    pickMusic,
    removeMusic,
    forgetProfile,
    create,
    save,
    view,
    clearError: () => setError(null),
  };
}

/** Đổi mẫu: giữ ảnh đã chọn, gán lại theo thứ tự vào các chỗ ảnh của mẫu mới. */
function remapPhotos(f: FormState, next: Template | null): Record<string, string> {
  if (!next) return {};
  const current = f.templateId ? getTemplate(f.templateId) : null;
  const ordered = (current?.photos ?? []).map((p) => f.photos[p.id]).filter((p): p is string => Boolean(p));
  const out: Record<string, string> = {};
  next.photos.forEach((slot, i) => {
    const p = ordered[i];
    if (p) out[slot.id] = p;
  });
  return out;
}
