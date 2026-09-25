import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { IconChevronLeft, IconClock, IconClose, IconPlus, Shield } from '../components/Icons';
import { LEAGUES, clubFromName, idlePreview, useFootballSettings, type IdleMode } from '../football';

const IDLE: { id: IdleMode; title: string; body: string }[] = [
  { id: 'auto', title: 'Automatic', body: 'Upcoming fixtures when the next match is close, otherwise the latest results.' },
  { id: 'results', title: 'Always show latest results', body: 'Full-time scores from your clubs and leagues.' },
  { id: 'fixtures', title: 'Always show upcoming fixtures', body: 'Kickoff times for the next matches.' },
];

// What the Home football row follows. Every change saves immediately.
export function FootballSettings() {
  const [s, save] = useFootballSettings();
  const [draft, setDraft] = useState('');

  const addClub = () => {
    const name = draft.trim();
    if (!name) return;
    const club = clubFromName(name);
    if (!s.clubs.some((c) => c.code === club.code)) save({ ...s, clubs: [...s.clubs, club] });
    setDraft('');
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
            <span key={c.code} className="club-chip">
              <Shield color={c.color} width={20} />
              {c.name}
              <button
                type="button"
                className="chip-x"
                aria-label={`Remove ${c.name}`}
                onClick={() => save({ ...s, clubs: s.clubs.filter((x) => x.code !== c.code) })}
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
            placeholder="Add a club"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addClub(); }}
          />
          <button type="button" className="ink-btn" onClick={addClub} disabled={!draft.trim()}>
            <IconPlus size={14} strokeWidth={2.2} />Add
          </button>
        </div>
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
          <span>{idlePreview(s)}</span>
        </div>
      </section>

      <section className="form-section split" aria-labelledby="car-h">
        <div>
          <h2 id="car-h">Carousel length</h2>
          <p className="form-help">How many matches to rotate through on Home.</p>
        </div>
        <label htmlFor="count" className="sr-only">Matches in the carousel</label>
        <select id="count" value={s.count} onChange={(e) => save({ ...s, count: Number(e.target.value) })}>
          <option value={3}>3 matches</option>
          <option value={5}>5 matches</option>
          <option value={8}>8 matches</option>
        </select>
      </section>
    </div>
  );
}
