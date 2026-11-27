import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export interface MiniStoriesContent {
  dates: Record<string, Record<string, any>>;
  homeInteractions: Record<string, Record<string, any>>;
}

export interface BondStoriesContent {
  bonds: any[];
  shuraEvents: any[];
}

export interface GameContent {
  map: any;
  districtEvents: Record<string, any[]>;
  properties: any[];
  businesses: any[];
  assetsCatalog: { assets: any[]; sets: any[] };
  heroines: any[];
  gifts: any[];
  skillsData: { skills: any[]; dailyTasks: any[]; mallItems: any[] };
  events: any[];
  stories: { volumes: any[] };
  miniStories: MiniStoriesContent;
  bondStories: BondStoriesContent;
  businessEvents: any[];
  achievements: any[];
}

function readJson(relPath: string): any {
  const fullPath = path.join(config.contentDir, relPath);
  const raw = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(raw);
}

function readOptionalJson<T>(relPath: string, fallback: T): T {
  const fullPath = path.join(config.contentDir, relPath);
  if (!fs.existsSync(fullPath)) return fallback;
  try {
    const raw = fs.readFileSync(fullPath, 'utf-8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[contentLoader] Failed to parse ${relPath}, using fallback:`, (err as Error).message);
    return fallback;
  }
}

function readOptionalMiniStories(relPath: string): MiniStoriesContent {
  const fullPath = path.join(config.contentDir, relPath);
  if (!fs.existsSync(fullPath)) {
    return { dates: {}, homeInteractions: {} };
  }
  try {
    const raw = fs.readFileSync(fullPath, 'utf-8').trim();
    if (!raw) return { dates: {}, homeInteractions: {} };
    const parsed = JSON.parse(raw);
    return {
      dates: parsed?.dates && typeof parsed.dates === 'object' ? parsed.dates : {},
      homeInteractions:
        parsed?.homeInteractions && typeof parsed.homeInteractions === 'object' ? parsed.homeInteractions : {},
    };
  } catch (err) {
    console.warn(`[contentLoader] Failed to parse ${relPath}, using empty fallback:`, (err as Error).message);
    return { dates: {}, homeInteractions: {} };
  }
}

let cachedContent: GameContent | null = null;

export function loadContent(): GameContent {
  cachedContent = {
    map: readJson('maps/haicheng.json'),
    districtEvents: readJson('maps/district_events.json'),
    properties: readJson('properties.json'),
    businesses: readJson('businesses.json'),
    assetsCatalog: readJson('assets_catalog.json'),
    heroines: readJson('heroines/heroines.json'),
    gifts: readJson('gifts.json'),
    skillsData: readJson('skills.json'),
    events: readJson('events/events.json'),
    stories: readJson('stories/stories.json'),
    miniStories: readOptionalMiniStories('stories/mini_stories.json'),
    bondStories: readOptionalJson<BondStoriesContent>('heroines/bond_stories.json', { bonds: [], shuraEvents: [] }),
    businessEvents: readOptionalJson<any[]>('business_events.json', []),
    achievements: readOptionalJson<any[]>('achievements.json', []),
  };
  return cachedContent;
}

export function getContent(): GameContent {
  if (!cachedContent) return loadContent();
  return cachedContent;
}

export function reloadContent(): GameContent {
  return loadContent();
}
