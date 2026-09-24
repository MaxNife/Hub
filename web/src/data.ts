export type AppType = 'static' | 'service';

export interface HubApp {
  id: string;
  name: string;
  description: string;
  category: string;
  type: AppType;
  icon: AppIconKind;
  lastOpened?: string;
  offline?: boolean;
}

export type AppIconKind =
  | 'football' | 'memory' | 'meal' | 'converter'
  | 'transcribe' | 'reaction' | 'puzzle' | 'random' | 'names';

export const APPS: HubApp[] = [
  { id: 'football', name: 'Football', description: 'Live scores, fixtures and tables', category: 'Info', type: 'service', icon: 'football', lastOpened: '5 min ago' },
  { id: 'memory', name: 'Memory', description: 'Match the pairs', category: 'Games', type: 'static', icon: 'memory', lastOpened: '1 hr ago' },
  { id: 'meal-picker', name: 'Meal picker', description: "Tonight's dinner, decided", category: 'Tools', type: 'static', icon: 'meal', lastOpened: 'Today' },
  { id: 'converter', name: 'Converter', description: 'Units and currencies', category: 'Tools', type: 'static', icon: 'converter', lastOpened: 'Yesterday' },
  { id: 'transcribe', name: 'Transcribe', description: 'Audio to text', category: 'Media', type: 'service', icon: 'transcribe', offline: true },
  { id: 'reaction', name: 'Reaction', description: 'Test your reflexes', category: 'Games', type: 'static', icon: 'reaction', lastOpened: '2 days ago' },
  { id: 'puzzle', name: 'Puzzle', description: 'Sliding tiles', category: 'Games', type: 'static', icon: 'puzzle' },
  { id: 'random', name: 'Random', description: 'Dice, coins, numbers', category: 'Tools', type: 'static', icon: 'random' },
  { id: 'names', name: 'Name generator', description: 'Project names on demand', category: 'Tools', type: 'static', icon: 'names' },
];

export const CATEGORIES = [
  { name: 'Games', color: '#8b6cff', count: 3 },
  { name: 'Tools', color: '#ff9a3d', count: 4 },
  { name: 'Info', color: '#2fc08f', count: 1 },
  { name: 'Media', color: '#33b6f0', count: 1 },
];
