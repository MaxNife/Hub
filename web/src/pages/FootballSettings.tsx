import { useEffect, useState } from 'react';
import { apiJSON } from '../api';
import { Link } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { IconChevronLeft, IconClock, IconClose, IconPlus, Shield } from '../components/Icons';
import { LEAGUES, clubFromName, idlePreview, type Club, useFootballFeed, useFootballSettings, type IdleMode } from '../football';
import { useApps } from '../live';

const IDLE: { id: IdleMode; title: string; body: string }[] = [
  { id: 'auto', title: 'Automatic', body: 'Upcoming fixtures when the next match is close, otherwise the latest results.' },
  { id: 'results', title: 'Always show latest results', body: 'Full-time scores from your clubs and leagues.' },
  { id: 'fixtures', title: 'Always show upcoming fixtures', body: 'Kickoff times for the next matches.' },
];

interface Team extends Club {
  fullName: string;
  league: string;
}

const pick = (t: Team): Club => ({ name: t.name, code: t.code, color: t.color });

// What the Home football row follows. Every change saves immediately.
export function FootballSettings() {
  const [s, save] = useFootballSettings();
  const [draft, setDraft] = useState('');
  const { apps, status } = useApps();
  const app = status === 'live' ? apps.find((a) => a.id === 'football' && a.installed) : undefined;
  const [now] = useState(() => new Date());
  const source = useFootballFeed(s, app, now);
  const nextDays = source.kind === 'live' || source.kind === 'sample' ? source.feed.nextMatchInDays : null;

  const [found, setFound] = useState<Team[] | null>(null);
  const [searchError, setSearchError] = useState('');

  // Search the clubs the Football app knows, so a saved club's name is
  // exactly the one its scores are listed under.
  useEffect(() => {
    const term = draft.trim();
    if (term.length < 2 || !app || app.offline) return;
    const t = window.setTimeout(() => {
      apiJSON<{ teams: Team[] }>(`/apps/football/api/teams?q=${encodeURIComponent(term)}`)
        .then((r) => { setFound(r.teams); setSearchError(''); })
        .catch((e: Error) => { setFound(null); setSearchError(e.message); });
    }, 300);
    return () => window.clearTimeout(t);
  }, [draft, app]);

  const addClub = (club: Club) => {
    const key = club.name.toLowerCase();
    if (!s.clubs.some((c) => c.name.toLowerCase() === key)) save({ ...s, clubs: [...s.clubs, club] });
    setDraft('');
    setFound(null);
  };
  // Enter or Add takes the top match. Without the Football app there's
  // nothing to search, so the typed name is used as it is.
  const canSearch = !!app && !app.offline && !searchError;
  const addDraft = () => {
    const name = draft.trim();
    if (!name) return;
    if (found?.length) addClub(pick(found[0]));
    else if (!canSearch) addClub(clubFromName(name));
  };

  return (
    <div className="form-page">
      <Link to="/" className="back-link"><IconChevronLeft size={16} />Home</Link>
      <div className="form-title">
        <span className="app-glyph lifted"><AppIcon kind="football" size={56} /></span>
        <h1>Football</h1>
      </div>
      <p className="form-lead">Choose what the Football widget follows on Home. Changes save as you make them.</p>

      <section className="form-section" aria-labelledby="leagues-h">
        <h2 id="leagues-h">Leagues</h2>
        <p className="form-help">Live matches and results from these leagues appear in the carousel.</p>
        <div className="check-grid">
          {LEAGUES.map((l) => (
            <label key={l.id} className="check-row">
              <input
                type="checkbox"
                checked={!!s.leagues[l.id]}
                onChange={() => save({ ...s, leagues: { ...s.leagues, [l.id]: !s.leagues[l.id] } })}
              />
              <span className="grow">{l.name}</span>
              <span className="check-note">{l.region}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="form-section" aria-labelledby="clubs-h">
        <h2 id="clubs-h">Clubs</h2>
        <p className="form-help">Your clubs always come first in the carousel, even in leagues you don't follow.</p>
        <div className="chip-row">
          {s.clubs.map((c) => (
            <span key={c.name} className="club-chip">
              <Shield color={c.color} width={20} />
              {c.name}
              <button
                type="button"
                className="chip-x"
                aria-label={`Remove ${c.name}`}
                onClick={() => save({ ...s, clubs: s.clubs.filter((x) => x.name !== c.name) })}
              >
                <IconClose size={14} />
              </button>
            </span>
          ))}
          <label htmlFor="club-add" className="sr-only">Add a club</label>
          <input
            id="club-add"
            className="club-input"
            type="text"
            autoComplete="off"
            placeholder="Search for a club"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim().length < 2) setFound(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') addDraft(); }}
          />
          <button type="button" className="ink-btn" onClick={addDraft} disabled={!draft.trim() || (canSearch && !found?.length)}>
            <IconPlus size={14} strokeWidth={2.2} />Add
          </button>
        </div>
        {searchError && <p className="form-help error-text">Couldn't search clubs ({searchError}). Add sets the name as typed.</p>}
        {!canSearch && !searchError && draft.trim() && (
          <p className="form-help">The Football app isn't running, so clubs can't be searched. Check the spelling matches its scores.</p>
        )}
        {found && draft.trim().length >= 2 && (
          <div className="link-list">
            {found.length === 0 && <p className="form-help">No clubs match “{draft.trim()}”.</p>}
            {found.map((t) => (
              <button key={t.fullName || t.name} type="button" className="link-row" onClick={() => addClub(pick(t))}>
                <Shield color={t.color} width={20} />
                <span className="grow"><b>{t.name}</b><small>{[t.fullName !== t.name && t.fullName, t.league].filter(Boolean).join(' · ')}</small></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="form-section" aria-labelledby="idle-h">
        <h2 id="idle-h">When nothing is live</h2>
        <div className="radio-list">
          {IDLE.map((o) => (
            <label key={o.id} className="radio-row">
              <input type="radio" name="idle" checked={s.idle === o.id} onChange={() => save({ ...s, idle: o.id })} />
              <span>
                <span className="radio-title">{o.title}</span>
                <span className="radio-body">{o.body}</span>
              </span>
            </label>
          ))}
        </div>
        {s.idle === 'auto' && (
          <div className="inline-field">
            <label htmlFor="window">Switch to fixtures</label>
            <select id="window" value={s.window} onChange={(e) => save({ ...s, window: Number(e.target.value) })}>
              <option value={0}>on match day</option>
              <option value={1}>1 day before kickoff</option>
              <option value={2}>2 days before kickoff</option>
              <option value={3}>3 days before kickoff</option>
            </select>
          </div>
        )}
        <div className="preview-note" aria-live="polite">
          <IconClock size={18} />
          <span>{idlePreview(s, nextDays)}</span>
        </div>
      </section>

      <section className="form-section split" aria-labelledby="car-h">
        <div>
          <h2 id="car-h">Carousel</h2>
          <p className="form-help">How many matches to rotate through on Home, and how fast.</p>
        </div>
        <label htmlFor="count" className="sr-only">Matches in the carousel</label>
        <select id="count" value={s.count} onChange={(e) => save({ ...s, count: Number(e.target.value) })}>
          <option value={3}>3 matches</option>
          <option value={5}>5 matches</option>
          <option value={8}>8 matches</option>
        </select>
      </section>

      <section className="form-section split" aria-labelledby="rot-h">
        <div>
          <h2 id="rot-h">Auto-rotate</h2>
          <p className="form-help">Move to the next match every few seconds. 0 turns it off.</p>
        </div>
        <label htmlFor="rotate" className="sr-only">Rotate every so many seconds</label>
        <div className="num-wrap">
          <input
            id="rotate"
            type="number"
            min={0}
            max={300}
            step={1}
            value={s.rotate}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              save({ ...s, rotate: Number.isFinite(v) ? Math.min(300, Math.max(0, v)) : 0 });
            }}
          />
          <span>seconds</span>
        </div>
      </section>
    </div>
  );
}
