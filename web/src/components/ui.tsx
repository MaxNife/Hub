import { useRef, type CSSProperties, type ReactNode } from 'react';
import { stagger } from '../motion';
import { AppIcon } from './AppIcon';
import type { TileApp, TileBadge } from '../live';
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


// Icon-first app tile: glyph, name, one line of detail, optional actions.
export function AppTile({ app, sub, index = 0, actions, disabled, badge }: {
  app: TileApp; sub?: ReactNode; index?: number; actions?: ReactNode; disabled?: boolean; badge?: TileBadge;
}) {
  const { launch } = useShell();
  const glyph = useRef<HTMLSpanElement>(null);
  const body = (
    <>
      <span ref={glyph} className="tile-icon">
        <AppGlyph app={app} size={96} />
        {badge === 'running' && <span className="badge-dot" title={app.service ? 'Running' : 'In progress'}><span className="sr-only">{app.service ? 'Running' : 'In progress'}</span></span>}
        {badge === 'down' && <span className="badge-dot down" title="Offline"><span className="sr-only">Offline</span></span>}
        {badge === 'update' && <span className="badge-pill">Update</span>}
      </span>
      <span className="tile-text">
        <span className="tile-name">{app.name}</span>
        {sub !== undefined && <span className={`tile-sub${app.offline ? ' off' : ''}`}>{app.offline ? 'Offline' : sub}</span>}
      </span>
    </>
  );
  return (
    <div className={`app-tile${disabled ? ' muted' : ''}`} style={stagger(index)}>
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

export function TileGrid({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="tile-grid" aria-label={label}>{children}</div>;
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

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="tile-grid" aria-busy="true" aria-label="Loading apps">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="app-tile skeleton" style={stagger(i)}>
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
