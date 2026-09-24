import { useRef, type CSSProperties, type ReactNode } from 'react';
import { stagger } from '../motion';
import { AppIcon } from './AppIcon';
import type { TileApp } from '../live';
import { useShell } from '../shell-context';

// App icon from either source, wrapped so launch can morph it.
export function AppGlyph({ app, size = 76 }: { app: TileApp; size?: number }) {
  const style = { width: size, height: size, borderRadius: size * 0.25 } as CSSProperties;
  return (
    <span className="app-glyph" style={style}>
      {app.iconSrc
        ? <img src={app.iconSrc} alt="" width={size} height={size} />
        : app.iconKind && <AppIcon kind={app.iconKind} size={size} />}
    </span>
  );
}

export function AppTile({ app, sub, index = 0, actions, disabled }: {
  app: TileApp; sub?: ReactNode; index?: number; actions?: ReactNode; disabled?: boolean;
}) {
  const { launch } = useShell();
  const glyph = useRef<HTMLSpanElement>(null);
  const body = (
    <>
      <span ref={glyph} className="glyph-slot"><AppGlyph app={app} /></span>
      <span className="name">{app.name}</span>
      {sub !== undefined && <span className={`sub${app.offline ? ' off' : ''}`}>{app.offline ? 'Offline' : sub}</span>}
    </>
  );
  return (
    <div className={`rcard${disabled ? ' muted' : ''}`} style={stagger(index)}>
      {disabled ? (
        <div className="tile">{body}</div>
      ) : (
        <button type="button" className="tile" onClick={() => launch(app.id, glyph.current?.firstElementChild)}>
          {body}
        </button>
      )}
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, eyebrow, children }: { title: string; eyebrow?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, body, action }: {
  icon: ReactNode; title: string; body: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="recent-grid" aria-busy="true" aria-label="Loading apps">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rcard skeleton" style={stagger(i)}>
          <span className="sk sk-icon" />
          <span className="sk sk-line" />
          <span className="sk sk-line short" />
        </div>
      ))}
    </div>
  );
}

export function DemoBanner() {
  return (
    <p className="demo-note">
      <span className="dot-pulse" /> Demo data — the Hub server isn't answering, so these are sample apps.
    </p>
  );
}
