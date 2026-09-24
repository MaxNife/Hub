import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APPS } from '../data';
import { AppIcon } from './AppIcon';
import { iconSrc, useLiveApps } from '../live';

// Ctrl+K palette over live apps (mock fallback when the server is down).
// Enter opens the top hit.
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const { data: live } = useLiveApps();
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  if (!open) return null;

  const launch = (id: string) => {
    fetch(`/api/apps/${id}/opened`, { method: 'POST' }).catch(() => {});
    nav(`/open/${id}`);
    onClose();
  };

  const query = q.trim().toLowerCase();
  const liveHits = (live ?? [])
    .filter((a) => a.installed)
    .filter((a) => !query || `${a.name} ${a.description ?? ''} ${a.category}`.toLowerCase().includes(query))
    .slice(0, 8);
  const showLive = live !== undefined;
  const mockHits = APPS.filter((a) =>
    !query || `${a.name} ${a.description} ${a.category}`.toLowerCase().includes(query),
  ).slice(0, 8);

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type to search apps…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (showLive && liveHits[0]) launch(liveHits[0].id);
              else if (!showLive && mockHits[0]) launch(mockHits[0].id);
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        {showLive ? (
          <ul>
            {liveHits.map((a) => (
              <li key={a.id}>
                <button onClick={() => launch(a.id)}>
                  <img src={iconSrc(a)} alt="" width={32} height={32} style={{ borderRadius: 8 }} />
                  <span><b>{a.name}</b><br /><small style={{ color: '#6a6574' }}>{a.description} · {a.category}</small></span>
                </button>
              </li>
            ))}
            {liveHits.length === 0 && <li style={{ padding: 16, color: '#6a6574' }}>No apps match.</li>}
          </ul>
        ) : (
          <ul>
            {mockHits.map((a) => (
              <li key={a.id}>
                <button onClick={() => launch(a.id)}>
                  <AppIcon kind={a.icon} size={32} />
                  <span><b>{a.name}</b><br /><small style={{ color: '#6a6574' }}>{a.description} · {a.category}</small></span>
                </button>
              </li>
            ))}
            {mockHits.length === 0 && <li style={{ padding: 16, color: '#6a6574' }}>No apps match.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
