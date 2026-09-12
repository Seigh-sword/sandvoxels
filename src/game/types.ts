import forest from '../assets/forest.png';
import { BLOCK_NAMES, blockColors } from './engine';
import type { IconName } from '../ui/PixelIcon';

export type Biome = 'Forest' | 'Plains' | 'Desert' | 'Alpine' | 'Tundra' | 'Swamp' | 'Savanna' | 'Badlands' | 'Jungle';
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

export const biomeId: Record<Biome, number> = {
  Forest: 0,
  Plains: 1,
  Desert: 2,
  Alpine: 3,
  Tundra: 4,
  Swamp: 5,
  Savanna: 6,
  Badlands: 7,
  Jungle: 8,
};

export const BIOMES: Biome[] = ['Forest', 'Plains', 'Desert', 'Alpine', 'Tundra', 'Swamp', 'Savanna', 'Badlands', 'Jungle'];

export interface BiomeInfo {
  top: string;
  side: string;
  icon: IconName;
  blurb: string;
}

export const biomeInfo: Record<Biome, BiomeInfo> = {
  Forest: { top: '#75a74c', side: '#4d7634', icon: 'trees', blurb: 'Oak canopies, winding rivers, and cozy hills.' },
  Plains: { top: '#9cc25e', side: '#6f9440', icon: 'sprout', blurb: 'Open grassland that runs to every horizon.' },
  Desert: { top: '#ddc895', side: '#c2a76e', icon: 'sun', blurb: 'Warm sand, cactus gardens, and big skies.' },
  Alpine: { top: '#e5eeeb', side: '#9aa7b8', icon: 'mountain', blurb: 'Snow-topped peaks and evergreen slopes.' },
  Tundra: { top: '#dfe9ef', side: '#8fa3b0', icon: 'snow', blurb: 'Frozen lakes, drifting snow, and hardy pines.' },
  Swamp: { top: '#6f8f5f', side: '#4d6b4a', icon: 'leaf', blurb: 'Muddy shallows, mist, and crooked trees.' },
  Savanna: { top: '#c8b464', side: '#a89054', icon: 'leaf', blurb: 'Golden grass and flat-topped acacia trees.' },
  Badlands: { top: '#b06a4a', side: '#8a4f38', icon: 'mountain', blurb: 'Terraced red rock carved into mesas.' },
  Jungle: { top: '#4f9c4a', side: '#2f7a3a', icon: 'trees', blurb: 'Tall canopy, giant mushrooms, and deep green.' },
};

export const initialWorlds: World[] = [
  { id: 'oakwood', name: 'Oakwood Valley', biome: 'Forest', mode: 'Creative', seed: 82413, played: 'Ready to explore', created: 1, favorite: true },
  { id: 'sunset', name: 'Sunset Ridge', biome: 'Desert', mode: 'Explorer', seed: 62371, played: 'Ready to explore', created: 2, favorite: false },
  { id: 'cloudrest', name: 'Cloudrest', biome: 'Alpine', mode: 'Creative', seed: 19173, played: 'Ready to explore', created: 3, favorite: false },
  { id: 'frostmere', name: 'Frostmere', biome: 'Tundra', mode: 'Explorer', seed: 40219, played: 'Ready to explore', created: 4, favorite: false },
  { id: 'verdanthollow', name: 'Verdant Hollow', biome: 'Jungle', mode: 'Creative', seed: 77451, played: 'Ready to explore', created: 5, favorite: false },
];

export const heroImage = forest;

export const modeId: Record<GameMode, number> = { Explorer: 0, Creative: 1 };

export const blocks = BLOCK_NAMES.slice(0, 9).map((name, index) => ({
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
