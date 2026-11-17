import { useTranslation } from 'react-i18next';
import { EASINGS } from '../../services/timeline';
import type { Clip, Easing, TimelineDoc, TrackId } from '../../services/types';
import { BoxIcon, Camera, ImageIcon } from '../../ui/Icon';
import { Select } from '../../ui/kit';

const TRACK_ICONS: Record<TrackId, typeof BoxIcon> = { product: BoxIcon, camera: Camera, logo: ImageIcon };
const UNIT_S = 's';
const TRACK_ORDER: TrackId[] = ['product', 'camera', 'logo'];

function tickStep(duration: number): number {
  if (duration <= 6) return 1;
  if (duration <= 15) return 3;
  if (duration <= 30) return 5;
  return 10;
}

export function Timeline({
  doc,
  time,
  onSeek,
  selectedId,
  onSelect,
  onUpdate,
}: {
  doc: TimelineDoc;
  time: number;
  onSeek: (t: number) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, patch: Partial<Pick<Clip, 'start' | 'end' | 'ease'>>) => void;
}) {
  const { t } = useTranslation();
  const d = doc.durationS;
  const step = tickStep(d);
  const ticks: number[] = [];
  for (let s = 0; s <= d + 1e-6; s += step) ticks.push(s);
  const selected = doc.clips.find((c) => c.id === selectedId) ?? null;
  const pct = (s: number) => `${(s / d) * 100}%`;

  const seekFromEvent = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSeek(Math.min(d, Math.max(0, ((e.clientX - rect.left) / rect.width) * d)));
  };

  return (
    <section className="timeline" data-testid="timeline" aria-label={t('ui.studio.timeline.title')}>
      <div className="tl-inspector" data-testid="clip-inspector">
        {selected ? (
          <>
            <strong className="tl-clip-name">{t(`ui.studio.clipKinds.${selected.kind}`)}</strong>
            <label className="mini-field">
              <span>{t('ui.studio.timeline.start')}</span>
              <input
                type="number"
                step={0.5}
                min={0}
                max={d}
                value={selected.start}
                data-testid="clip-start"
                onChange={(e) => onUpdate(selected.id, { start: Number(e.target.value) })}
              />
              <span className="unit">{UNIT_S}</span>
            </label>
            <label className="mini-field">
              <span>{t('ui.studio.timeline.end')}</span>
              <input
                type="number"
                step={0.5}
                min={0}
                max={d}
                value={selected.end}
                data-testid="clip-end"
                onChange={(e) => onUpdate(selected.id, { end: Number(e.target.value) })}
              />
              <span className="unit">{UNIT_S}</span>
            </label>
            <Select
              label={t('ui.studio.timeline.easing')}
              className="select-mini"
              value={selected.ease}
              data-testid="clip-ease"
              onChange={(e) => onUpdate(selected.id, { ease: e.target.value as Easing })}
            >
              {EASINGS.map((x) => (
                <option key={x} value={x}>
                  {t(`ui.studio.easing.${x}`)}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <span className="muted small">{t('ui.studio.timeline.hint')}</span>
        )}
      </div>
      <div className="tl-body">
        <div className="tl-row tl-ruler-row">
          <span className="tl-label" />
          <div className="tl-lane tl-ruler" onClick={seekFromEvent} data-testid="timeline-ruler">
            {ticks.map((s) => (
              <span key={s} className="tick" style={{ left: pct(s) }}>
                {`${s}s`}
              </span>
            ))}
          </div>
        </div>
        {TRACK_ORDER.map((track) => {
          const Icon = TRACK_ICONS[track];
          return (
            <div key={track} className="tl-row" data-track={track}>
              <span className="tl-label">
                <Icon size={14} /> {t(`ui.studio.tracks.${track}`)}
              </span>
              <div className="tl-lane" onClick={seekFromEvent}>
                {doc.clips
                  .filter((c) => c.track === track)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`clip clip-${track}${selectedId === c.id ? ' clip-selected' : ''}`}
                      style={{ left: pct(c.start), width: `calc(${pct(c.end - c.start)})` }}
                      aria-pressed={selectedId === c.id}
                      data-testid="clip"
                      data-id={c.id}
                      data-start={c.start}
                      data-end={c.end}
                      data-ease={c.ease}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(selectedId === c.id ? null : c.id);
                      }}
                    >
                      <span className="kf kf-start" />
                      <span className="clip-label">{t(`ui.studio.clipKinds.${c.kind}`)}</span>
                      <span className="kf kf-end" />
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
        <div className="playhead-wrap" aria-hidden>
          <div className="playhead" style={{ left: pct(Math.min(time, d)) }} data-testid="playhead" data-time={time.toFixed(1)}>
            <span className="playhead-bubble">{`${Math.floor(time)}s`}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
