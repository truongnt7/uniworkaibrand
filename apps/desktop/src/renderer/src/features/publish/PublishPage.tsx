import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../app/Toast';
import { navigate } from '../../app/router';
import { useAsync } from '../../hooks';
import { useServices } from '../../services';
import { formatClock } from '../../services/timeline';
import type { ArtScene, CaptionDraft, Channel, LibraryItem } from '../../services/types';
import { ArtThumb } from '../../ui/ArtThumb';
import { Check, CircleCheck, Copy, Download, FolderOpen, Heart, Info, Play, RefreshCw, Send, Sparkles, X } from '../../ui/Icon';
import { Button, Modal, PageHeader, Tabs } from '../../ui/kit';

const draftKey = (itemId: string, ch: Channel) => `${itemId}:${ch}`;
const LIMITS: Record<Channel, number> = { facebook: 5000, instagram: 2200 };
const IG_RATIOS = [1, 4 / 5, 9 / 16];

function ChannelGlyph({ id }: { id: string }) {
  const style: Record<string, string> = { facebook: '#1877f2', instagram: '#e4405f', tiktok: '#111111' };
  const label: Record<string, string> = { facebook: 'f', instagram: 'ig', tiktok: 'tt' };
  return (
    <span className="glyph" style={{ background: style[id] ?? '#888' }} aria-hidden>
      {label[id]}
    </span>
  );
}

function ChooseContentModal({ currentId, onPick, onClose }: { currentId: string; onPick: (i: LibraryItem) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { library } = useServices();
  const list = useAsync(() => library.list({ pageSize: 100 }), [library]);
  const done = (list.data?.items ?? []).filter((i) => i.status === 'done');
  return (
    <Modal title={t('ui.publish.chooseContent')} onClose={onClose} testId="choose-content-modal">
      <ul className="picker">
        {done.map((i) => (
          <li key={i.id}>
            <button type="button" className={`picker-item${i.id === currentId ? ' picker-active' : ''}`} onClick={() => onPick(i)} data-testid="choose-item" data-id={i.id}>
              <ArtThumb art={i.art} className="picker-thumb" />
              <span>
                <strong>{i.name}</strong>
                <span className="muted small"> {i.format} · {i.productName}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function PublishPage({ itemId }: { itemId?: string }) {
  const { t, i18n } = useTranslation();
  const { library, publish, files } = useServices();
  const toast = useToast();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<Channel>('facebook');
  const [previewChannel, setPreviewChannel] = useState<Channel>('instagram');
  const [selectedChannels, setSelectedChannels] = useState<Record<string, boolean>>({ facebook: true, instagram: true, tiktok: false });
  const [drafts, setDrafts] = useState<Record<string, CaptionDraft>>({});
  const [covers, setCovers] = useState<Record<string, number>>({});
  const [tagInput, setTagInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const channels = useAsync(() => publish.channels(), [publish]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = itemId ? await library.get(itemId) : null;
      if (found && found.status === 'done') return alive && setItem(found);
      const vids = await library.list({ tab: 'video', pageSize: 100 });
      const first = vids.items.find((i) => i.status === 'done') ?? (await library.list({ pageSize: 100 })).items.find((i) => i.status === 'done') ?? null;
      if (alive) setItem(first);
    })();
    return () => {
      alive = false;
    };
  }, [library, itemId]);

  const generate = async (ch: Channel, it: LibraryItem) => {
    const d = await publish.suggestCaption(it, ch);
    setDrafts((prev) => ({ ...prev, [draftKey(it.id, ch)]: d }));
  };

  const itemKey = item?.id ?? '';
  useEffect(() => {
    if (!item) return;
    let alive = true;
    void Promise.all([publish.suggestCaption(item, 'facebook'), publish.suggestCaption(item, 'instagram')]).then(([facebook, instagram]) => {
      if (alive) setDrafts((prev) => ({ ...prev, [draftKey(item.id, 'facebook')]: facebook, [draftKey(item.id, 'instagram')]: instagram }));
    });
    return () => {
      alive = false;
    };
  }, [item, publish]);

  const regenerate = async () => {
    if (!item) return;
    setGenerating(true);
    try {
      await generate(editChannel, item);
    } finally {
      setGenerating(false);
    }
  };

  const draft = drafts[draftKey(itemKey, editChannel)] ?? { text: '', hashtags: [] };
  const cover = covers[itemKey] ?? 0;
  const limit = LIMITS[editChannel];
  const nf = new Intl.NumberFormat(i18n.language === 'en' ? 'en' : 'vi');
  const coverScenes = useMemo<ArtScene[]>(() => (item ? [item.art.scene, 'studio', 'minimal'] : []), [item]);
  const chosenCount = Object.entries(selectedChannels).filter(([id, v]) => v && channels.data?.find((c) => c.id === id)?.connected).length;

  const setDraft = (next: CaptionDraft) => setDrafts((prev) => ({ ...prev, [draftKey(itemKey, editChannel)]: next }));
  const addTag = () => {
    const raw = tagInput.trim().replace(/^#*/, '').replace(/\s+/g, '');
    if (!raw) return;
    const tag = `#${raw}`;
    if (!draft.hashtags.includes(tag)) setDraft({ ...draft, hashtags: [...draft.hashtags, tag] });
    setTagInput('');
  };

  const fullText = `${draft.text}${draft.hashtags.length ? `\n\n${draft.hashtags.join(' ')}` : ''}`;
  const copy = async () => {
    try {
      await publish.copyToClipboard(fullText);
      toast(t('ui.publish.copied'));
    } catch {
      toast(t('ui.publish.copyFailed'));
    }
  };

  const previewDraft = drafts[draftKey(itemKey, previewChannel)];
  const ratio = item ? item.width / item.height : 1;
  const igFits = IG_RATIOS.some((r) => Math.abs(r - ratio) < 0.03);

  const tabs = [
    { id: 'facebook' as const, label: t('ui.publish.facebook'), icon: <ChannelGlyph id="facebook" /> },
    { id: 'instagram' as const, label: t('ui.publish.instagram'), icon: <ChannelGlyph id="instagram" /> },
  ];

  return (
    <div className="page publish" data-testid="publish-page">
      <PageHeader
        title={t('ui.publish.title')}
        subtitle={t('ui.publish.subtitle')}
        actions={
          <Button disabled data-testid="manage-connections">
            {t('ui.publish.manage')} <span className="soon">{t('ui.common.soon')}</span>
          </Button>
        }
      />
      <ol className="stepper stepper-3" aria-label={t('ui.studio.steps.label')}>
        {[1, 2, 3].map((n) => (
          <li key={n} className={`step ${n < 3 ? 'step-done' : 'step-active'}`} aria-current={n === 3 ? 'step' : undefined}>
            <span className="step-btn">
              <span className="step-dot">{n < 3 ? <Check size={14} strokeWidth={3} /> : n}</span>
              <span className="step-label">{t(`ui.publish.steps.s${n}`)}</span>
            </span>
            {n < 3 ? <span className="step-line" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      <div className="publish-grid">
        <section className="pcol" aria-label={t('ui.publish.selectedContent')}>
          <h2 className="col-title">{t('ui.publish.selectedContent')}</h2>
          {item ? (
            <>
              <ArtThumb art={item.art} ratio="1 / 1" className="selected-art" data-testid="selected-content">
                {item.kind === 'video' ? (
                  <>
                    <span className="play-dot play-center">
                      <Play size={18} fill="currentColor" />
                    </span>
                    <span className="duration">{formatClock(item.durationS ?? 0)}</span>
                  </>
                ) : null}
              </ArtThumb>
              <div className="selected-meta">
                <div>
                  <div className="card-title ellipsis" title={item.name} data-testid="selected-name">
                    {item.name}
                  </div>
                  <div className="muted small">
                    {item.width} × {item.height} {item.kind === 'video' ? '· 30 fps' : ''}
                  </div>
                </div>
                <Button onClick={() => setChooseOpen(true)} data-testid="change-content">
                  <RefreshCw size={14} /> {t('ui.publish.change')}
                </Button>
              </div>
            </>
          ) : (
            <p className="muted">{t('ui.publish.noContent')}</p>
          )}
          <h3 className="sub-title">{t('ui.publish.chooseChannels')}</h3>
          <ul className="channels" data-testid="channels">
            {(channels.data ?? []).map((c) => (
              <li key={c.id} className={`channel${c.connected ? '' : ' channel-off'}`}>
                <ChannelGlyph id={c.id} />
                <div className="grow">
                  <div className="card-title">{c.name}</div>
                  <div className="muted small">
                    {c.connected ? (
                      <>
                        {c.type} · <span className="dot dot-ok" /> {t('ui.publish.connected')}
                      </>
                    ) : (
                      <>
                        <span className="dot dot-warn" /> {t('ui.publish.notAuthorized')}
                      </>
                    )}
                  </div>
                </div>
                {c.connected ? (
                  <input
                    type="checkbox"
                    className="check"
                    checked={!!selectedChannels[c.id]}
                    aria-label={c.name}
                    data-testid={`channel-${c.id}`}
                    onChange={(e) => setSelectedChannels((s) => ({ ...s, [c.id]: e.target.checked }))}
                  />
                ) : (
                  <Button disabled className="btn-sm">
                    {t('ui.publish.connect')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small" data-testid="chosen-count">
            {t('ui.publish.chosenCount', { count: chosenCount })}
          </p>
        </section>

        <section className="pcol" aria-label={t('ui.publish.postContent')}>
          <div className="pcol-head">
            <h2 className="col-title">{t('ui.publish.postContent')}</h2>
          </div>
          <div className="caption-bar">
            <Tabs variant="underline" label={t('ui.publish.postContent')} items={tabs} value={editChannel} onChange={setEditChannel} />
            <Button variant="lime" disabled={!item || generating} onClick={() => void regenerate()} data-testid="ai-caption">
              <Sparkles size={14} /> {t('ui.publish.aiCaption')}
            </Button>
          </div>
          <div className="caption-box">
            <textarea
              value={draft.text}
              maxLength={limit}
              aria-label={t('ui.publish.captionLabel')}
              data-testid="caption-input"
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            <div className="counter muted small" data-testid="caption-counter">
              {nf.format(draft.text.length)} / {nf.format(limit)}
            </div>
          </div>
          <div className="chips" data-testid="hashtags">
            {draft.hashtags.map((h) => (
              <span key={h} className="tag tag-removable" data-testid="hashtag">
                {h}
                <button type="button" aria-label={t('ui.publish.removeTag', { tag: h })} onClick={() => setDraft({ ...draft, hashtags: draft.hashtags.filter((x) => x !== h) })}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <input
              className="tag-input"
              value={tagInput}
              placeholder={t('ui.publish.addTag')}
              aria-label={t('ui.publish.addTag')}
              data-testid="hashtag-input"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
          </div>
          <h3 className="sub-title">{t('ui.publish.cover')}</h3>
          <div className="covers" role="radiogroup" aria-label={t('ui.publish.cover')}>
            {coverScenes.map((scene, idx) => (
              <button key={scene} type="button" role="radio" aria-checked={cover === idx} className={`cover${cover === idx ? ' cover-on' : ''}`} data-testid="cover" onClick={() => setCovers((c) => ({ ...c, [itemKey]: idx }))}>
                {item ? <ArtThumb art={{ product: item.art.product, scene }} ratio="4 / 3" /> : null}
                {cover === idx ? (
                  <span className="check-dot">
                    <CircleCheck size={18} fill="currentColor" stroke="#fff" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <h3 className="sub-title">{t('ui.publish.manualTitle')}</h3>
          <div className="manual-actions">
            <Button variant="dark" disabled={!item} onClick={() => void copy()} data-testid="copy-caption">
              <Copy size={15} /> {t('ui.publish.copyCaption')}
            </Button>
            <Button
              disabled={!item}
              onClick={() =>
                item &&
                void files.download(item).then(({ fileName }) => toast(t('ui.library.downloadStarted', { name: fileName })))
              }
              data-testid="download-file"
            >
              <Download size={15} /> {item?.kind === 'video' ? t('ui.publish.downloadVideo') : t('ui.publish.downloadImage')}
            </Button>
            <Button
              disabled={!item}
              onClick={() => item && void files.revealInFolder(item).then(() => toast(t('ui.publish.revealed')))}
              data-testid="reveal-folder"
            >
              <FolderOpen size={15} /> {t('ui.publish.openFolder')}
            </Button>
          </div>
          <p className="note" data-testid="v1-note">
            <Info size={14} /> {t('ui.publish.v1Note')}
          </p>
        </section>

        <section className="pcol" aria-label={t('ui.publish.preview')}>
          <h2 className="col-title">{t('ui.publish.preview')}</h2>
          <Tabs variant="underline" label={t('ui.publish.preview')} items={tabs} value={previewChannel} onChange={setPreviewChannel} />
          {item ? (
            <div className={`post post-${previewChannel}`} data-testid="post-preview" data-channel={previewChannel}>
              <div className="post-head">
                <span className="avatar avatar-sm" aria-hidden>
                  {'b'}
                </span>
                <strong>{previewChannel === 'instagram' ? 'botanic.vn' : 'BOTANIC Việt Nam'}</strong>
              </div>
              <ArtThumb art={{ product: item.art.product, scene: coverScenes[cover] ?? item.art.scene }} ratio={previewChannel === 'instagram' ? '4 / 5' : '16 / 11'} className="post-art">
                {item.kind === 'video' ? (
                  <span className="play-dot play-center play-big">
                    <Play size={22} fill="currentColor" />
                  </span>
                ) : null}
              </ArtThumb>
              <div className="post-actions" aria-hidden>
                <Heart size={18} />
                <Send size={18} />
              </div>
              <p className="post-caption" data-testid="post-caption">
                <strong>{previewChannel === 'instagram' ? 'botanic.vn ' : ''}</strong>
                {previewDraft?.text} <span className="post-tags">{previewDraft?.hashtags.join(' ')}</span>
              </p>
            </div>
          ) : null}
          <div className="fit" data-testid="fit-note">
            <CircleCheck size={15} className="ok-text" />
            <span>{previewChannel === 'instagram' && !igFits ? t('ui.publish.fitWarn') : t('ui.publish.fitOk')}</span>
            {item ? <span className="tag">{ratioLabel(item)}</span> : null}
          </div>
        </section>
      </div>
      {chooseOpen && item ? (
        <ChooseContentModal
          currentId={item.id}
          onClose={() => setChooseOpen(false)}
          onPick={(i) => {
            setItem(i);
            setChooseOpen(false);
            navigate('/publish', { item: i.id });
          }}
        />
      ) : null}
    </div>
  );
}

function ratioLabel(item: LibraryItem): string {
  const r = item.width / item.height;
  if (Math.abs(r - 9 / 16) < 0.03) return '9:16';
  if (Math.abs(r - 16 / 9) < 0.03) return '16:9';
  if (Math.abs(r - 4 / 5) < 0.03) return '4:5';
  return '1:1';
}
