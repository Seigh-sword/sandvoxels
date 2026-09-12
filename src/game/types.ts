import alpine from '../assets/alpine.png';
import desert from '../assets/desert.png';
import forest from '../assets/forest.png';
import { BLOCK_NAMES, blockColors } from './engine';

export type Biome = 'Forest' | 'Desert' | 'Alpine';
export type GameMode = 'Creative' | 'Explorer';

export const STORAGE_PREFIX = 'sandvoxel';
export const storageKey = (name: string) => `${STORAGE_PREFIX}-${name}`;

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
  Forest: forest,
  Desert: desert,
  Alpine: alpine,
};

export const biomeId: Record<Biome, number> = { Forest: 0, Desert: 1, Alpine: 2 };
export const modeId: Record<GameMode, number> = { Explorer: 0, Creative: 1 };

export const blocks = BLOCK_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  ...blockColors(index + 1),
}));

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  let id = '';
  for (let i = 0; i < 32; i++) {
    const roll = Math.floor(Math.random() * 16);
    id += i === 12 ? '4' : i === 16 ? '89ab'[roll & 3] : roll.toString(16);
  }
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

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
