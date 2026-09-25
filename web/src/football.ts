import { readJSON, useStored, write } from './store';

// Football widget: what it follows (set on /settings/football) and the
// sample fixtures it shows until the Football service app provides real ones.

export type IdleMode = 'auto' | 'results' | 'fixtures';

export interface Club {
  name: string;
  color: string;
  code: string;
}

export interface FootballSettings {
  leagues: Record<string, boolean>;
  clubs: Club[];
  idle: IdleMode;
  window: number; // auto mode: switch to fixtures this many days before kickoff
  count: number; // matches in the carousel
}

export const LEAGUES = [
  { id: 'pl', name: 'Premier League', region: 'England' },
  { id: 'ucl', name: 'Champions League', region: 'Europe' },
  { id: 'fa', name: 'FA Cup', region: 'England' },
  { id: 'liga', name: 'La Liga', region: 'Spain' },
  { id: 'sa', name: 'Serie A', region: 'Italy' },
  { id: 'bl', name: 'Bundesliga', region: 'Germany' },
];

const CLUBS: Record<string, Club> = {
  ARS: { code: 'ARS', name: 'Arsenal', color: '#DB0007' },
  CHE: { code: 'CHE', name: 'Chelsea', color: '#034694' },
  LIV: { code: 'LIV', name: 'Liverpool', color: '#C8102E' },
  EVE: { code: 'EVE', name: 'Everton', color: '#003399' },
  BHA: { code: 'BHA', name: 'Brighton', color: '#0057B8' },
  NEW: { code: 'NEW', name: 'Newcastle', color: '#241F20' },
  PSG: { code: 'PSG', name: 'PSG', color: '#004170' },
  RMA: { code: 'RMA', name: 'Real Madrid', color: '#FEBE10' },
  BAR: { code: 'BAR', name: 'Barcelona', color: '#A50044' },
};

// Known clubs keep their colours; anything else gets a neutral shield.
export function clubFromName(name: string): Club {
  const known = Object.values(CLUBS).find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (known) return known;
  return { name, color: '#6B6457', code: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() };
}

export const DEFAULT_SETTINGS: FootballSettings = {
  leagues: { pl: true, ucl: true },
  clubs: [CLUBS.ARS],
  idle: 'auto',
  window: 2,
  count: 5,
};

const KEY = 'football:settings';

export function useFootballSettings(): [FootballSettings, (next: FootballSettings) => void] {
  const raw = useStored(KEY);
  let settings = DEFAULT_SETTINGS;
  if (raw) settings = { ...DEFAULT_SETTINGS, ...readJSON<Partial<FootballSettings>>(KEY, {}) };
  return [settings, (next) => write(KEY, JSON.stringify(next))];
}

export interface Match {
  home: Club;
  away: Club;
  center: string; // score, or kickoff time for fixtures
  league: string;
  leagueId: string;
  detail: string;
  minute?: string;
}

const m = (h: string, a: string, center: string, leagueId: string, detail: string): Match => ({
  home: CLUBS[h],
  away: CLUBS[a],
  center,
  leagueId,
  league: LEAGUES.find((l) => l.id === leagueId)?.name ?? leagueId,
  detail,
});

// Sample data: tonight's matches kick off at 20:00 and are live until 21:50.
const SAMPLE_LIVE = [m('ARS', 'CHE', '2–1', 'pl', ''), m('LIV', 'EVE', '0–0', 'pl', '')];
const SAMPLE_RESULTS = [
  m('ARS', 'CHE', '2–1', 'pl', 'Saturday at the Emirates'),
  m('ARS', 'PSG', '3–1', 'ucl', 'Last Wednesday'),
  m('BHA', 'ARS', '0–2', 'pl', 'Sunday two weeks ago'),
  m('LIV', 'EVE', '1–1', 'pl', 'Saturday at Anfield'),
];
const NEXT_MATCH_DAYS = 5;
const SAMPLE_FIXTURES = [
  m('ARS', 'NEW', '17:30', 'pl', `In ${NEXT_MATCH_DAYS} days at the Emirates`),
  m('PSG', 'ARS', '20:00', 'ucl', 'In 9 days in Paris'),
  m('BHA', 'ARS', '15:00', 'pl', 'In 12 days at the Amex'),
  m('CHE', 'LIV', '16:30', 'pl', 'In 6 days at Stamford Bridge'),
];

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function liveMinute(now: Date): number | null {
  const mins = (now.getHours() - 20) * 60 + now.getMinutes();
  if (mins < 0 || mins > 110) return null;
  if (mins <= 45) return Math.max(1, mins);
  if (mins <= 60) return 45; // half time
  return Math.min(90, mins - 15);
}

function follows(s: FootballSettings, match: Match): { ok: boolean; club: boolean } {
  const codes = new Set(s.clubs.map((c) => c.code));
  const club = codes.has(match.home.code) || codes.has(match.away.code);
  return { ok: club || !!s.leagues[match.leagueId], club };
}

// Followed clubs first, then leagues; trimmed to the carousel length.
function pick(s: FootballSettings, list: Match[]): Match[] {
  return list
    .map((match, i) => ({ match, i, f: follows(s, match) }))
    .filter((x) => x.f.ok)
    .sort((a, b) => Number(b.f.club) - Number(a.f.club) || a.i - b.i)
    .slice(0, s.count)
    .map((x) => x.match);
}

export type FeedMode = 'live' | 'results' | 'fixtures';

// What "When nothing is live" resolves to right now.
export function idleMode(s: FootballSettings): 'results' | 'fixtures' {
  if (s.idle !== 'auto') return s.idle;
  return s.window >= NEXT_MATCH_DAYS ? 'fixtures' : 'results';
}

export function idlePreview(s: FootballSettings): string {
  if (s.idle === 'results') return 'Right now Home shows the latest results.';
  if (s.idle === 'fixtures') return 'Right now Home shows upcoming fixtures.';
  if (s.window >= NEXT_MATCH_DAYS) {
    return `Right now Home shows upcoming fixtures, because the next match is in ${NEXT_MATCH_DAYS} days.`;
  }
  const when = s.window === 0 ? 'on match day' : s.window === 1 ? '1 day before kickoff' : `${s.window} days before kickoff`;
  return `Right now Home shows the latest results. The next match is in ${NEXT_MATCH_DAYS} days, so fixtures take over ${when}.`;
}

export interface Feed {
  mode: FeedMode;
  matches: Match[];
  note: string;
}

export function footballFeed(s: FootballSettings, now: Date): Feed {
  const minute = liveMinute(now);
  if (minute !== null) {
    const live = pick(s, SAMPLE_LIVE).map((x, i) => {
      const mm = Math.max(1, minute - i * 3);
      return { ...x, minute: `${mm}′`, detail: minute === 45 && i === 0 ? 'Half time' : `${ordinal(mm)} minute` };
    });
    if (live.length) {
      return { mode: 'live', matches: live, note: `${live.length} ${live.length === 1 ? 'match' : 'matches'} live` };
    }
  }
  const mode = idleMode(s);
  if (mode === 'fixtures') {
    return { mode, matches: pick(s, SAMPLE_FIXTURES), note: `Kickoff in ${NEXT_MATCH_DAYS} days` };
  }
  return { mode, matches: pick(s, SAMPLE_RESULTS), note: `Next match in ${NEXT_MATCH_DAYS} days` };
}
