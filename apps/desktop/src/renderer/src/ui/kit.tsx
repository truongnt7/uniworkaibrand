import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from './Icon';

type Variant = 'dark' | 'outline' | 'lime' | 'ghost';

export function Button({
  variant = 'outline',
  block = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return <button type={type} className={`btn btn-${variant}${block ? ' btn-block' : ''} ${className}`.trim()} {...rest} />;
}

export function IconButton({
  label,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type={type} aria-label={label} title={label} className={`icon-btn ${className}`.trim()} {...rest} />;
}

export function Chip({
  active = false,
  children,
  icon,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} className={`chip${active ? ' chip-active' : ''} ${className}`.trim()} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = 'pill',
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'pill' | 'underline';
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`tabs tabs-${variant}`}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          type="button"
          aria-selected={value === it.id}
          data-testid={`tab-${it.id}`}
          className={`tab${value === it.id ? ' tab-active' : ''}`}
          onClick={() => onChange(it.id)}
        >
          {it.icon}
          <span>{it.label}</span>
          {it.count !== undefined ? <span className="tab-count">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  testId?: string;
}) {
  return (
    <label className="search">
      <Search size={15} aria-hidden />
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function Select({
  label,
  icon,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; icon?: ReactNode }) {
  return (
    <label className={`select ${className}`.trim()}>
      {icon}
      <select aria-label={label} {...rest}>
        {children}
      </select>
      <ChevronDown size={15} aria-hidden className="select-caret" />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  testId,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      className={`switch${checked ? ' switch-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  onPage,
  shownLabel,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  shownLabel: string;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager" data-testid="pager">
      <span className="muted small" data-testid="pager-label">
        {shownLabel}
      </span>
      <div className="pager-buttons">
        <IconButton label={t('ui.common.prev')} disabled={page <= 1} onClick={() => onPage(page - 1)} className="pager-btn">
          <ChevronLeft size={15} />
        </IconButton>
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            className={`pager-btn${p === page ? ' pager-active' : ''}`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ))}
        <IconButton label={t('ui.common.next')} disabled={page >= pages} onClick={() => onPage(page + 1)} className="pager-btn">
          <ChevronRight size={15} />
        </IconButton>
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  testId = 'modal',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal" data-testid={testId}>
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label={t('ui.common.close')} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function PanelHeader({ title, onClose }: { title: string; onClose?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {onClose ? (
        <IconButton label={t('ui.common.close')} onClick={onClose}>
          <X size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <span key={c} className="swatch" style={{ background: c }} title={c} />
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="empty" data-testid="empty-state">
      {children}
    </div>
  );
}
