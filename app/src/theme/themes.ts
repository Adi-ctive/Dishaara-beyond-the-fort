// Every appearance the raahi can pick. A theme is a palette (light and dark),
// an ornament set, an optional particle effect and an unlock rule.

export type Tokens = {
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  danger: string;
};

export type Ornament = 'toran' | 'arch' | 'rangoli' | 'stars' | 'plain';
export type Particles = 'none' | 'diyas' | 'petals' | 'stars';

export type Unlock =
  | { kind: 'free' }
  | { kind: 'season'; label: string }
  | { kind: 'level'; level: number }
  | { kind: 'tier'; city: string; tier: 'bronze' | 'silver' | 'gold' }
  | { kind: 'role'; role: 'saarthi' | 'business' | 'moderator' };

export type Theme = {
  id: string;
  name: { en: string; hi: string };
  light: Tokens;
  dark: Tokens | null; // null = the theme is dark only
  ornament: Ornament;
  particles: Particles;
  unlock: Unlock;
};

const DANGER = '#C8372D';

export const THEMES: Theme[] = [
  {
    id: 'marigold',
    name: { en: 'Marigold', hi: 'गेंदा' },
    light: {
      bg: '#FFF7EA', surface: '#FFFFFF', surface2: '#FBEBD0', ink: '#1D2340', muted: '#5E6482',
      line: '#EBDCC0', primary: '#26346B', onPrimary: '#FFF7EA', accent: '#E8962A', onAccent: '#1D2340', danger: DANGER,
    },
    dark: {
      bg: '#11152A', surface: '#1A2042', surface2: '#232A52', ink: '#F7EEDC', muted: '#A6ABC8',
      line: '#2E3663', primary: '#F0A945', onPrimary: '#11152A', accent: '#F0A945', onAccent: '#11152A', danger: '#F06A5E',
    },
    ornament: 'toran',
    particles: 'none',
    unlock: { kind: 'free' },
  },
  {
    id: 'diwali',
    name: { en: 'Diwali', hi: 'दीवाली' },
    light: {
      bg: '#2A0F16', surface: '#3A1620', surface2: '#4A1D2A', ink: '#FFF1DC', muted: '#D9B2A3',
      line: '#5A2734', primary: '#FFB547', onPrimary: '#2A0F16', accent: '#E8457A', onAccent: '#FFF1DC', danger: '#FF6B5E',
    },
    dark: null,
    ornament: 'rangoli',
    particles: 'diyas',
    unlock: { kind: 'season', label: 'Diwali' },
  },
  {
    id: 'sandstone',
    name: { en: 'Sandstone', hi: 'बलुआ पत्थर' },
    light: {
      bg: '#F5ECDD', surface: '#FFF9F0', surface2: '#EFE1C9', ink: '#2B2118', muted: '#7A6A58',
      line: '#E2D2B6', primary: '#1F6F6B', onPrimary: '#FFF9F0', accent: '#B5552F', onAccent: '#FFF9F0', danger: DANGER,
    },
    dark: {
      bg: '#1A1511', surface: '#251E18', surface2: '#30271F', ink: '#F3E8D6', muted: '#B3A38E',
      line: '#3A3027', primary: '#4FB3A5', onPrimary: '#1A1511', accent: '#D9784F', onAccent: '#1A1511', danger: '#F06A5E',
    },
    ornament: 'arch',
    particles: 'none',
    unlock: { kind: 'free' },
  },
  {
    id: 'royal',
    name: { en: 'Royal', hi: 'राजसी' },
    light: {
      bg: '#F6F2FB', surface: '#FFFFFF', surface2: '#ECE4F7', ink: '#24163A', muted: '#6E6280',
      line: '#E0D6EE', primary: '#4B2A7B', onPrimary: '#FFFFFF', accent: '#C99A2E', onAccent: '#24163A', danger: DANGER,
    },
    dark: {
      bg: '#150D22', surface: '#20152F', surface2: '#2A1D3D', ink: '#F2EAFB', muted: '#AE9FC4',
      line: '#352750', primary: '#D9AE45', onPrimary: '#150D22', accent: '#D9AE45', onAccent: '#150D22', danger: '#F06A5E',
    },
    ornament: 'arch',
    particles: 'none',
    unlock: { kind: 'level', level: 3 },
  },
  {
    id: 'peacock',
    name: { en: 'Peacock', hi: 'मोर' },
    light: {
      bg: '#F3F3F0', surface: '#FFFFFF', surface2: '#E6ECEA', ink: '#1E2226', muted: '#63686D',
      line: '#DDE0DC', primary: '#0E6B78', onPrimary: '#FFFFFF', accent: '#B0843A', onAccent: '#FFFFFF', danger: DANGER,
    },
    dark: {
      bg: '#0F1416', surface: '#172022', surface2: '#1F2B2E', ink: '#ECF1F0', muted: '#9AA6A6',
      line: '#26363A', primary: '#3FB5C2', onPrimary: '#0F1416', accent: '#D6A65A', onAccent: '#0F1416', danger: '#F06A5E',
    },
    ornament: 'plain',
    particles: 'none',
    unlock: { kind: 'level', level: 5 },
  },
  {
    id: 'gwalior-night',
    name: { en: 'Gwalior night', hi: 'ग्वालियर की रात' },
    light: {
      bg: '#15131D', surface: '#211E2C', surface2: '#2B2738', ink: '#F1ECE2', muted: '#A49FB0',
      line: '#363145', primary: '#E9A23B', onPrimary: '#15131D', accent: '#4FB3A5', onAccent: '#15131D', danger: '#F06A5E',
    },
    dark: null,
    ornament: 'stars',
    particles: 'stars',
    unlock: { kind: 'tier', city: 'Gwalior', tier: 'gold' },
  },
];

// Role themes: saarthis, shop owners and the team each get one no raahi can.
THEMES.push(
  {
    id: 'field',
    name: { en: 'Saarthi field', hi: 'सारथी फ़ील्ड' },
    light: {
      bg: '#F4EFE4', surface: '#FFFCF6', surface2: '#E9E0CC', ink: '#1F2A26', muted: '#66705F',
      line: '#DDD2BA', primary: '#1F6F6B', onPrimary: '#FFFCF6', accent: '#B5552F', onAccent: '#FFFCF6', danger: DANGER,
    },
    dark: {
      bg: '#121816', surface: '#1B2421', surface2: '#24302C', ink: '#EDF0E8', muted: '#A3AE9F',
      line: '#2E3B36', primary: '#4FB3A5', onPrimary: '#121816', accent: '#E08A5F', onAccent: '#121816', danger: '#F06A5E',
    },
    ornament: 'arch',
    particles: 'none',
    unlock: { kind: 'role', role: 'saarthi' },
  },
  {
    id: 'bazaar',
    name: { en: 'Bazaar', hi: 'बाज़ार' },
    light: {
      bg: '#F2FBF8', surface: '#FFFFFF', surface2: '#DDF2EC', ink: '#163330', muted: '#5A716C',
      line: '#CBE6DF', primary: '#E8962A', onPrimary: '#163330', accent: '#1F6F6B', onAccent: '#FFFFFF', danger: DANGER,
    },
    dark: {
      bg: '#0F1B19', surface: '#162623', surface2: '#1E322E', ink: '#E8F6F2', muted: '#9DB5AF',
      line: '#28403B', primary: '#F0A945', onPrimary: '#0F1B19', accent: '#4FB3A5', onAccent: '#0F1B19', danger: '#F06A5E',
    },
    ornament: 'toran',
    particles: 'petals',
    unlock: { kind: 'role', role: 'business' },
  },
  {
    id: 'watch',
    name: { en: 'Night watch', hi: 'रात की निगरानी' },
    light: {
      bg: '#11152A', surface: '#1A2042', surface2: '#232A52', ink: '#F7EEDC', muted: '#A6ABC8',
      line: '#2E3663', primary: '#F0A945', onPrimary: '#11152A', accent: '#4FB3A5', onAccent: '#11152A', danger: '#F06A5E',
    },
    dark: null,
    ornament: 'stars',
    particles: 'stars',
    unlock: { kind: 'role', role: 'moderator' },
  },
);

export const DEFAULT_THEME = 'marigold';

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// Demo profile: level 1, Diwali is in season. Real values come from the backend.
export function isUnlocked(t: Theme, level: number, tiers: string[] = [], roles: string[] = []): boolean {
  const u = t.unlock;
  if (u.kind === 'role') return roles.includes(u.role);
  if (u.kind === 'free' || u.kind === 'season') return true;
  if (roles.some((r) => r === 'saarthi' || r === 'business' || r === 'moderator')) return true; // partners are not here for the game
  if (u.kind === 'level') return level >= u.level;
  return tiers.includes(`${u.city}:${u.tier}`);
}

export function unlockHint(t: Theme, lang: 'en' | 'hi'): string {
  const u = t.unlock;
  if (u.kind === 'level') return lang === 'hi' ? `लेवल ${u.level} पर खुलेगा` : `Unlocks at level ${u.level}`;
  if (u.kind === 'tier') return lang === 'hi' ? `${u.city} का गोल्ड पासपोर्ट` : `${u.city} gold passport`;
  if (u.kind === 'season') return lang === 'hi' ? 'त्योहार थीम' : 'Festival theme';
  if (u.kind === 'role') return u.role === 'saarthi' ? (lang === 'hi' ? 'सिर्फ़ सारथी' : 'Saarthis only') : u.role === 'business' ? (lang === 'hi' ? 'सिर्फ़ दुकान मालिक' : 'Shop owners only') : lang === 'hi' ? 'सिर्फ़ दिशारा टीम' : 'Dishaara team only';
  return '';
}
