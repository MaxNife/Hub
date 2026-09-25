import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiJSON } from '../api';
import { IconCalendar, IconChevronLeft, IconClock, IconCloud, IconRefresh, IconSearch } from '../components/Icons';
import { AppGlyph } from '../components/ui';
import { useApps } from '../live';
import { eventText, tempText, useHubSettings, useStatus, type Place, type WeatherSettings } from '../status';
import { useShell } from '../shell-context';

// What the line above the greeting shows: weather, next event, app health.
export function StatusSettings() {
  const qc = useQueryClient();
  const { toast } = useShell();
  const { data: settings } = useHubSettings();
  const { data: status } = useStatus();
  const { apps, status: appsStatus } = useApps();
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [checking, setChecking] = useState('');

  // Debounced place search through Hub (the browser never calls out).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = window.setTimeout(() => {
      apiJSON<Place[]>(`/api/geocode?q=${encodeURIComponent(term)}`)
        .then((p) => { setPlaces(p); setSearchError(''); })
        .catch((e: Error) => { setPlaces(null); setSearchError(e.message); });
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['settings'] });
    // The server refetches the forecast right away; give it a moment.
    window.setTimeout(() => qc.invalidateQueries({ queryKey: ['status'] }), 1200);
  };

  const saveWeather = async (w: WeatherSettings) => {
    try {
      await apiJSON('/api/settings/weather', { method: 'PUT', json: w });
      setQ('');
      setPlaces(null);
      await refresh();
      toast(`Weather for ${w.name}`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const removeWeather = async () => {
    await api('/api/settings/weather', { method: 'DELETE' });
    await refresh();
  };

  const check = async (id: string) => {
    setChecking(id);
    await api(`/api/apps/${id}/check`, { method: 'POST' }).catch(() => {});
    await qc.invalidateQueries({ queryKey: ['apps'] });
    await qc.invalidateQueries({ queryKey: ['status'] });
    setChecking('');
  };

  const weather = settings?.weather ?? null;
  const now = status?.weather.value;
  const event = status?.nextEvent;
  const services = apps.filter((a) => a.service && a.installed);

  return (
    <div className="form-page">
      <Link to="/settings" className="back-link"><IconChevronLeft size={16} />Settings</Link>
      <div className="form-title"><h1>Weather and calendar</h1></div>
      <p className="form-lead">What the line above your greeting shows. Hub refreshes these on its own, so Home never waits.</p>

      <section className="form-section" aria-labelledby="weather-h">
        <h2 id="weather-h">Weather</h2>
        <p className="form-help">Current conditions from Open-Meteo, every 15 minutes.</p>
        {weather ? (
          <div className="status-card">
            <span className="link-icon solid"><IconCloud size={18} /></span>
            <span className="grow">
              <b>{weather.name}</b>
              <small>
                {now ? `${tempText(now)} ${now.label} · high ${now.high}°, low ${now.low}°` : status?.weather.error ? `Couldn't reach the forecast: ${status.weather.error}` : 'Fetching the forecast…'}
              </small>
            </span>
            <button type="button" className="text-link" onClick={removeWeather}>Remove</button>
          </div>
        ) : (
          <p className="form-help">No location yet. Search for your town below.</p>
        )}
        {weather && (
          <div className="seg" role="radiogroup" aria-label="Temperature units">
            {(['celsius', 'fahrenheit'] as const).map((u) => (
              <button key={u} type="button" role="radio" aria-checked={weather.units === u} className={weather.units === u ? 'on' : ''}
                onClick={() => saveWeather({ ...weather, units: u })}>
                {u === 'celsius' ? '°C' : '°F'}
              </button>
            ))}
          </div>
        )}
        <label htmlFor="place" className="search-field compact">
          <IconSearch size={18} strokeWidth={2} />
          <span className="sr-only">Search for a place</span>
          <input id="place" type="text" autoComplete="off" placeholder={weather ? 'Change location' : 'Search for a town or city'}
            value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 2) setPlaces(null); }} />
        </label>
        {searchError && <p className="form-help error-text">{searchError}</p>}
        {places && (
          <div className="link-list">
            {places.length === 0 && <p className="form-help">No places match “{q}”.</p>}
            {places.map((p) => (
              <button key={`${p.latitude},${p.longitude}`} type="button" className="link-row"
                onClick={() => saveWeather({ name: p.name, latitude: p.latitude, longitude: p.longitude, units: weather?.units ?? 'celsius' })}>
                <span className="grow"><b>{p.name}</b><small>{[p.region, p.country].filter(Boolean).join(', ')}</small></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="form-section" aria-labelledby="cal-h">
        <h2 id="cal-h">Calendar</h2>
        {settings?.calendarConfigured ? (
          <>
            <p className="form-help">Your next event in the coming 24 hours, from your calendar's private iCal link.</p>
            <div className="status-card">
              <span className="link-icon solid"><IconCalendar size={18} /></span>
              <span className="grow">
                <b>{event?.value ? eventText(event.value) : event?.error ? 'Calendar unreachable' : 'Nothing in the next 24 hours'}</b>
                <small>{event?.error ? event.error : event?.value?.location ?? 'Checked every 10 minutes'}</small>
              </span>
            </div>
          </>
        ) : (
          <p className="form-help">
            Not connected. Copy your calendar's private iCal (ICS) link, set it as <code>HUB_CALENDAR_ICS</code>, and restart Hub.
            The link is a secret, so it lives in Hub's environment rather than here.
          </p>
        )}
      </section>

      <section className="form-section" aria-labelledby="health-h">
        <h2 id="health-h">App health</h2>
        <p className="form-help">Hub checks each service app every 30 seconds.</p>
        {appsStatus !== 'live' ? (
          <p className="form-help">Start the Hub server to see app health.</p>
        ) : services.length === 0 ? (
          <p className="form-help">No service apps installed. Static apps are always up.</p>
        ) : (
          <div className="link-list">
            {services.map((a) => {
              const live = a.running;
              const at = a.healthCheckedAt ? new Date(a.healthCheckedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
              return (
                <div key={a.id} className="link-row static">
                  <AppGlyph app={a} size={32} />
                  <span className="grow">
                    <b><span className={`dot${a.offline ? ' bad' : live ? '' : ' warn'}`} /> {a.name}</b>
                    <small>
                      {a.offline ? `Down: ${a.healthError ?? 'no answer'}` : live ? `Answering in ${a.healthLatencyMs ?? '?'} ms` : 'Not checked yet'}
                      {at && <> · <IconClock size={12} /> {at}</>}
                    </small>
                  </span>
                  <button type="button" className="pill-btn" onClick={() => check(a.id)} disabled={checking === a.id}>
                    <IconRefresh size={16} className={checking === a.id ? 'spin' : ''} /><span className="d-only">Check now</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
