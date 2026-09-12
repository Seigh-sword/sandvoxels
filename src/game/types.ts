export type Biome = 'Forest' | 'Desert' | 'Alpine';
export type GameMode = 'Creative' | 'Explorer';

export interface World {
  id: string;
  name: string;
  biome: Biome;
  mode: GameMode;
  seed: number;
  played: string;
  created: number;
  favorite: boolean;
}

export interface Settings {
  quality: 'Performance' | 'Balanced' | 'High';
  fov: number;
  sensitivity: number;
  sound: boolean;
  volume: number;
  showFps: boolean;
  touch: boolean;
  invertY: boolean;
}

export const defaultSettings: Settings = {
  quality: 'Balanced',
  fov: 75,
  sensitivity: 50,
  sound: true,
  volume: 40,
  showFps: false,
  touch: false,
  invertY: false,
};

export const initialWorlds: World[] = [
  { id: 'oakwood', name: 'Oakwood Valley', biome: 'Forest', mode: 'Creative', seed: 82413, played: 'Ready to explore', created: 1, favorite: true },
  { id: 'sunset', name: 'Sunset Ridge', biome: 'Desert', mode: 'Explorer', seed: 62371, played: 'Ready to explore', created: 2, favorite: false },
  { id: 'cloudrest', name: 'Cloudrest', biome: 'Alpine', mode: 'Creative', seed: 19173, played: 'Ready to explore', created: 3, favorite: false },
];

export const biomeImages: Record<Biome, string> = {
  Forest: '/images/valley.jpg',
  Desert: '/images/desert.jpg',
  Alpine: '/images/snow.jpg',
};

export const blocks = [
  { id: 1, name: 'Grass', color: '#78a450', side: '#846143' },
  { id: 2, name: 'Dirt', color: '#99704e', side: '#755139' },
  { id: 3, name: 'Stone', color: '#9b9d9a', side: '#737773' },
  { id: 4, name: 'Oak log', color: '#a78859', side: '#6f5031' },
  { id: 5, name: 'Leaves', color: '#638a43', side: '#426032' },
  { id: 6, name: 'Sand', color: '#e0c790', side: '#bda471' },
  { id: 7, name: 'Snow', color: '#edf4ee', side: '#b8d0d3' },
  { id: 8, name: 'Oak planks', color: '#c59a62', side: '#99754b' },
  { id: 9, name: 'Brick', color: '#b66c52', side: '#8f4d3c' },
];

export function loadLocal<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) as T : fallback;
  } catch {
    return fallback;
  }
}

export function saveLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
