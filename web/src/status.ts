import { useQuery } from '@tanstack/react-query';
import { apiJSON } from './api';

// /api/status: the status line's weather, next event and app health.

export interface WeatherNow {
  place: string;
  temperature: number;
  high: number;
  low: number;
  units: 'celsius' | 'fahrenheit';
  code: number;
  label: string;
  isDay: boolean;
}

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

interface Entry<T> {
  configured: boolean;
  value: T | null;
  updatedAt?: string;
  error?: string;
}

export interface Status {
  weather: Entry<WeatherNow>;
  nextEvent: Entry<CalendarEvent>;
  health: { total: number; running: number; down: { id: string; name: string; error?: string }[] };
}

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: () => apiJSON<Status>('/api/status'),
    retry: 1,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export interface WeatherSettings {
  name: string;
  latitude: number;
  longitude: number;
  units: 'celsius' | 'fahrenheit';
}

export interface HubSettings {
  weather: WeatherSettings | null;
  calendarConfigured: boolean;
  categoryOrder: string[];
  authEnabled: boolean;
}

export function useHubSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => apiJSON<HubSettings>('/api/settings'),
    retry: 1,
  });
}

export interface Place {
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

// "Standup at 15:00", "Tomorrow: Standup at 09:30", "Today: Birthday".
export function eventText(e: CalendarEvent, now = new Date()): string {
  const start = new Date(e.start);
  const sameDay = start.toDateString() === now.toDateString();
  const day = sameDay ? '' : 'Tomorrow: ';
  if (e.allDay) return `${sameDay ? 'Today' : 'Tomorrow'}: ${e.title}`;
  const time = start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}${e.title} at ${time}`;
}

export const tempText = (w: WeatherNow) => `${w.temperature}°`;
