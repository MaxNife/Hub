import { useQuery } from '@tanstack/react-query';
import { apiJSON } from './api';
import { readJSON, useStored, write } from './store';
import type { TileApp } from './live';

// Football widget: what it follows (set on /settings/football), the live
// feed from the Football service app, and sample data when that app isn't
// installed yet.

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

// ─── Feed ────────────────────────────────────────────────────────────────

export interface Match {
  home: Club;
  away: Club;
  state: 'pre' | 'in' | 'post';
  score: { home: string; away: string } | null;
  kickoff: string; // ISO
  minute?: string | null;
  league: string;
  leagueId: string;
  venue?: string;
}

export type FeedMode = 'live' | 'results' | 'fixtures';

export interface Feed {
  mode: FeedMode;
  note: string;
  matches: Match[];
  nextMatchInDays: number | null;
}

export type FeedSource =
  | { kind: 'live'; feed: Feed }
  | { kind: 'sample'; feed: Feed }
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
  | { kind: 'loading' };

// The Football app's feed when it's installed and answering; sample data
// (clearly marked) when it isn't installed at all.
export function useFootballFeed(settings: FootballSettings, app: TileApp | undefined, now: Date): FeedSource {
  const enabled = !!app && !app.offline;
  const params = new URLSearchParams({
    leagues: LEAGUES.filter((l) => settings.leagues[l.id]).map((l) => l.id).join(','),
    clubs: settings.clubs.map((c) => c.name).join(','),
    idle: settings.idle,
    window: String(settings.window),
    count: String(settings.count),
  });
  const q = useQuery({
    queryKey: ['football-feed', params.toString()],
    queryFn: () => apiJSON<Feed>(`/apps/football/api/feed?${params}`),
    enabled,
    retry: 1,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.mode === 'live' ? 60_000 : 5 * 60_000),
  });
  if (!app) return { kind: 'sample', feed: sampleFeed(settings, now) };
  if (app.offline) return { kind: 'offline' };
  if (q.data) return { kind: 'live', feed: q.data };
  if (q.error) return { kind: 'error', message: (q.error as Error).message };
  return { kind: 'loading' };
}

// ─── Formatting (one path for live and sample data) ─────────────────────

const PILL: Record<FeedMode, string> = { live: 'Live', results: 'Full time', fixtures: 'Up next' };
export const pillLabel = (m: FeedMode) => PILL[m];

function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

const hhmm = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function dayWord(d: Date, now: Date): string {
  const a = new Date(d);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((a.getTime() - b.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (Math.abs(diff) < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// "2–1" for played matches, the local kickoff time for fixtures.
export function centerText(m: Match): string {
  if (m.score) return `${m.score.home}–${m.score.away}`;
  return hhmm(new Date(m.kickoff));
}

// The grey line under the teams.
export function detailText(m: Match, now: Date): string {
  const at = m.venue ? ` at ${m.venue}` : '';
  if (m.state === 'in') {
    if (m.minute === 'HT') return 'Half time';
    const n = parseInt(m.minute ?? '', 10);
    return Number.isFinite(n) ? `${ordinal(n)} minute` : 'In play';
  }
  return `${dayWord(new Date(m.kickoff), now)}${at}`;
}

// Short minute for the mobile pill: 67′.
export function minuteText(m: Match): string | null {
  if (m.state !== 'in' || !m.minute) return null;
  if (m.minute === 'HT') return 'HT';
  const n = parseInt(m.minute, 10);
  return Number.isFinite(n) ? `${n}′` : null;
}

// What "When nothing is live" resolves to, given the next match.
export function idlePreview(s: FootballSettings, nextDays: number | null): string {
  if (s.idle === 'results') return 'Right now Home shows the latest results.';
  if (s.idle === 'fixtures') return 'Right now Home shows upcoming fixtures.';
  if (nextDays === null) return 'Right now Home shows the latest results; no match is scheduled yet.';
  const inDays = nextDays === 0 ? 'today' : nextDays === 1 ? 'tomorrow' : `in ${nextDays} days`;
  if (s.window >= nextDays) return `Right now Home shows upcoming fixtures, because the next match is ${inDays}.`;
  const when = s.window === 0 ? 'on match day' : s.window === 1 ? '1 day before kickoff' : `${s.window} days before kickoff`;
  return `Right now Home shows the latest results. The next match is ${inDays}, so fixtures take over ${when}.`;
}

// ─── Sample data (until the Football app is installed) ──────────────────

const NEXT_MATCH_DAYS = 5;

function sampleMatches(now: Date) {
  const at = (days: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const mk = (h: string, a: string, leagueId: string, state: Match['state'], kickoff: string, score: [number, number] | null, venue: string): Match => ({
    home: CLUBS[h], away: CLUBS[a], state, kickoff, venue, leagueId,
    league: LEAGUES.find((l) => l.id === leagueId)?.name ?? leagueId,
    score: score ? { home: String(score[0]), away: String(score[1]) } : null,
  });
  return {
    live: [mk('ARS', 'CHE', 'pl', 'in', at(0, 20), [2, 1], 'Emirates Stadium'), mk('LIV', 'EVE', 'pl', 'in', at(0, 20), [0, 0], 'Anfield')],
    results: [
      mk('LIV', 'EVE', 'pl', 'post', at(-1, 15), [1, 1], 'Anfield'),
      mk('ARS', 'CHE', 'pl', 'post', at(-3, 17, 30), [2, 1], 'Emirates Stadium'),
      mk('ARS', 'PSG', 'ucl', 'post', at(-8, 20), [3, 1], 'Emirates Stadium'),
      mk('BHA', 'ARS', 'pl', 'post', at(-11, 15), [0, 2], 'Amex Stadium'),
    ],
    fixtures: [
      mk('ARS', 'NEW', 'pl', 'pre', at(NEXT_MATCH_DAYS, 17, 30), null, 'Emirates Stadium'),
      mk('CHE', 'LIV', 'pl', 'pre', at(6, 16, 30), null, 'Stamford Bridge'),
      mk('PSG', 'ARS', 'ucl', 'pre', at(9, 20), null, 'Parc des Princes'),
      mk('BHA', 'ARS', 'pl', 'pre', at(12, 15), null, 'Amex Stadium'),
    ],
  };
}

// Tonight's sample matches are "live" from 20:00 to 21:50 local time.
function liveMinute(now: Date): string | null {
  const mins = (now.getHours() - 20) * 60 + now.getMinutes();
  if (mins < 0 || mins > 110) return null;
  if (mins <= 45) return `${Math.max(1, mins)}'`;
  if (mins <= 60) return 'HT';
  return `${Math.min(90, mins - 15)}'`;
}

function pick(s: FootballSettings, list: Match[]): Match[] {
  const codes = new Set(s.clubs.map((c) => c.code));
  return list
    .map((match, i) => ({ match, i, club: codes.has(match.home.code) || codes.has(match.away.code) }))
    .filter((x) => x.club || s.leagues[x.match.leagueId])
    .sort((a, b) => Number(b.club) - Number(a.club) || a.i - b.i)
    .slice(0, s.count)
    .map((x) => x.match);
}

export function sampleFeed(s: FootballSettings, now: Date): Feed {
  const data = sampleMatches(now);
  const minute = liveMinute(now);
  if (minute) {
    const live = pick(s, data.live).map((m) => ({ ...m, minute }));
    if (live.length) return { mode: 'live', note: `${live.length} ${live.length === 1 ? 'match' : 'matches'} live`, matches: live, nextMatchInDays: NEXT_MATCH_DAYS };
  }
  const mode = s.idle === 'auto' ? (s.window >= NEXT_MATCH_DAYS ? 'fixtures' : 'results') : s.idle;
  if (mode === 'fixtures') return { mode, note: `Kickoff in ${NEXT_MATCH_DAYS} days`, matches: pick(s, data.fixtures), nextMatchInDays: NEXT_MATCH_DAYS };
  return { mode, note: `Next match in ${NEXT_MATCH_DAYS} days`, matches: pick(s, data.results), nextMatchInDays: NEXT_MATCH_DAYS };
}
