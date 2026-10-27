// App configuration: onboarding interests, badge rules and the ticket shape. No sample content.

export const INTERESTS: { id: string; en: string; hi: string; icon: string; tags: string[] }[] = [
  { id: 'history', en: 'History', hi: 'इतिहास', icon: '🏛', tags: ['architecture', 'royal', 'museums'] },
  { id: 'forts', en: 'Forts and palaces', hi: 'किले और महल', icon: '🏰', tags: ['architecture', 'royal'] },
  { id: 'temples', en: 'Temple architecture', hi: 'मंदिर स्थापत्य', icon: '🛕', tags: ['temples', 'architecture'] },
  { id: 'music', en: 'Music heritage', hi: 'संगीत विरासत', icon: '🎶', tags: ['music'] },
  { id: 'museums', en: 'Museums', hi: 'संग्रहालय', icon: '🖼', tags: ['museums'] },
  { id: 'spiritual', en: 'Spiritual places', hi: 'आध्यात्मिक स्थल', icon: '🪔', tags: ['spiritual'] },
  { id: 'culture', en: 'Culture', hi: 'संस्कृति', icon: '🎭', tags: ['music', 'temples'] },
  { id: 'food', en: 'Foodie', hi: 'खाने के शौकीन', icon: '🍛', tags: ['food'] },
  { id: 'souvenirs', en: 'Souvenirs and crafts', hi: 'सोवेनियर और शिल्प', icon: '🧵', tags: ['markets'] },
  { id: 'photo', en: 'Photography', hi: 'फ़ोटोग्राफ़ी', icon: '📷', tags: [] },
  { id: 'nature', en: 'Nature', hi: 'प्रकृति', icon: '🌿', tags: ['nature'] },
  { id: 'modern', en: 'Modern city', hi: 'आधुनिक शहर', icon: '🏙', tags: ['modern'] },
  { id: 'adventure', en: 'Adventure and activities', hi: 'रोमांच और गतिविधियाँ', icon: '🧗', tags: ['activities'] },
  { id: 'movies', en: 'Movie spots', hi: 'फ़िल्मी जगहें', icon: '🎬', tags: [] },
];

export const likesFor = (ids: string[]) => [...new Set(INTERESTS.filter((i) => ids.includes(i.id)).flatMap((i) => i.tags))];

export const BADGES = [
  { id: 'explorer', en: 'Explorer', hi: 'खोजी', rule: 'Collect 3 stamps', need: 3, kind: 'stamps' },
  { id: 'gem', en: 'Hidden gem hunter', hi: 'छुपे रत्न', rule: 'Collect 2 rare stamps', need: 2, kind: 'rare' },
  { id: 'early', en: 'Early bird', hi: 'जल्दी पंछी', rule: 'Visit at a quiet hour', need: 1, kind: 'quiet' },
  { id: 'helper', en: 'Helper', hi: 'मददगार', rule: 'Feedback accepted twice', need: 2, kind: 'feedback' },
  { id: 'foodie', en: 'Foodie', hi: 'खाने के शौकीन', rule: 'Visit 2 Bazaar food stalls', need: 2, kind: 'food' },
  { id: 'indore', en: 'Indore explorer', hi: 'इंदौर खोजी', rule: 'Collect 2 stamps in Indore', need: 2, kind: 'indore' },
  { id: 'twocities', en: 'Two cities', hi: 'दो शहर', rule: 'Collect a stamp in Gwalior and in Indore', need: 2, kind: 'cities' },
  { id: 'night', en: 'Night owl', hi: 'रात का पंछी', rule: 'Collect a stamp after 7 PM', need: 1, kind: 'night' },
];

export type Ticket = { id: string; place: string; from: string; text: string; status: 'open' | 'answered' | 'escalated'; proof?: string; answer?: string };
