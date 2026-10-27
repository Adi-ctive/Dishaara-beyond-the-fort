// Rule-based chat used in the demo when no model is connected. Answers come from the same
// stored facts and rules as the rest of the app, so it never invents anything. On the event day
// the backend chatbot (Groq, behind the RAG agent) replaces respond() with the same reply shape.
import { checkUnit, confirmItems, guardrail, parseTrip, promotable, rankedPlaces, windowFor, type Data, type Place } from '../core';
import type { Lang } from '../theme/ThemeProvider';

export type Card = { kind: 'place'; id: string } | { kind: 'places'; ids: string[] } | { kind: 'quick'; hours?: number } | { kind: 'bazaar' } | { kind: 'sos' } | { kind: 'roadmap' };
export type Reply = { text: string; cards: Card[]; chips: string[] };

const EMERGENCY = /emergency|ambulance|police|hospital|injur|accident|unsafe|help me|आपात|एम्बुलेंस|पुलिस|अस्पताल|मदद/i;
const PLAN = /plan|itinerar|trip|day out|hours?\b|roadmap|घंटे|प्लान|योजना|घूम/i;
const OPEN = /open|today|खुला|आज/i;
const FEE = /ticket|fee|price|cost|₹|टिकट|शुल्क|कीमत/i;
const FOOD = /food|eat|lunch|snack|shop|souvenir|खाना|नाश्ता|दुकान/i;
const FOLLOW = /(this|that|it|there|these|those|listed|where is|how far|how long|get there)|यह|वह|वहाँ|कहाँ/i;
const LESSER = /hidden|lesser|less known|offbeat|quiet|unusual|छुपे|कम भीड़|अनजान/i;

// Starter questions for the city on screen: the ticket chip names its first plannable place (Gwalior Fort, Central Museum...).
export const starterChips = (hi: boolean, data?: Data) => {
  const top = data?.places.find((p) => p.guardrail.status !== 'notEligible' && !p.units.every((u) => u.fees.v === null));
  const ticket = top ? (hi ? `${top.name.hi} की टिकट` : `${top.name.en} ticket price`) : hi ? 'टिकट की कीमत' : 'Ticket prices';
  return hi ? ['आज क्या खुला है?', ticket, 'छुपी जगहें', 'पास में खाना'] : ['What is open today?', ticket, 'Hidden places', 'Food nearby'];
};

function verdictToday(data: Data, p: Place, today: string) {
  return checkUnit(data, p.units[0], today).verdict;
}

export function respond(text: string, data: Data, today: string, lang: Lang, last: string[] = []): Reply {
  const hi = lang === 'hi';
  // A follow-up with no place name ("how much is it?") is about the places the last reply showed.
  const named = rankedPlaces(data, text).length ? rankedPlaces(data, text) : FOLLOW.test(text) ? last.filter((id) => data.places.some((p) => p.id === id)) : [];
  if (EMERGENCY.test(text)) {
    return { text: hi ? 'तुरंत मदद के लिए 112 पर कॉल करें। नीचे बटन है।' : 'For help right now, call 112. The button is below.', cards: [{ kind: 'sos' }], chips: [] };
  }
  const trip = parseTrip(text, today);
  if (trip.uncoveredCity) {
    const city = trip.uncoveredCity.replace(/^./, (c) => c.toUpperCase());
    return { text: hi ? `${city} अभी शामिल नहीं है। दिशारा अभी ग्वालियर और इंदौर में है।` : `${city} is not covered yet. Dishaara covers Gwalior and Indore.`, cards: [], chips: starterChips(hi, data) };
  }
  if (FEE.test(text)) {
    // No place named and nothing to follow on from: ask, never show the fort by default.
    const id = named[0];
    if (!id) return { text: hi ? 'किस जगह की टिकट जाननी है? नाम लिखें।' : 'Which place do you want the ticket price for? Type its name.', cards: [], chips: data.places.filter((x) => guardrail(x, today).ok).slice(0, 3).map((x) => (hi ? `${x.name.hi} की टिकट` : `${x.name.en} ticket`)) };
    const p = data.places.find((x) => x.id === id)!;
    return { text: hi ? `${p.name.hi} की टिकट, तारीख और स्रोत के साथ:` : `Ticket details for ${p.name.en}, with dates and sources:`, cards: [{ kind: 'place', id }], chips: starterChips(hi, data) };
  }
  if (named.length) {
    const p = data.places.find((x) => x.id === named[0])!;
    const v = verdictToday(data, p, today);
    const say = {
      good: hi ? 'आज जा सकते हैं।' : 'You can go today.',
      precautions: hi ? 'आज जा सकते हैं, कुछ सावधानी के साथ।' : 'You can go today, with a few cautions.',
      confirm: (hi ? 'जाने से पहले पुष्टि करें: ' : 'Confirm before you go: ') + confirmItems(checkUnit(data, p.units[0], today), lang).join('; ') + (hi ? '।' : '.'),
      not: hi ? 'आज संभव नहीं लगता।' : 'It does not look possible today.',
    }[v];
    return { text: `${p.name[lang]}: ${say}`, cards: [{ kind: 'place', id: p.id }], chips: starterChips(hi, data) };
  }
  if (PLAN.test(text)) {
    const hours = trip.hours && trip.hours <= 12 ? Math.round(trip.hours) : undefined;
    return { text: hi ? 'आपका दिन कुछ टैप में बनाते हैं।' : "Let's build your day in a few taps.", cards: [{ kind: 'quick', hours }], chips: [] };
  }
  if (LESSER.test(text)) {
    const ids = data.places.filter((p) => promotable(p, today)).map((p) => p.id);
    return ids.length
      ? { text: hi ? 'ये जगहें संरक्षकों ने सुझाई हैं:' : 'Places their custodians are happy to see more visitors at:', cards: [{ kind: 'places', ids }], chips: starterChips(hi, data) }
      : { text: hi ? 'अभी किसी संरक्षक ने कोई जगह सुझाई नहीं है।' : 'No custodian has flagged a place for more visitors yet.', cards: [], chips: starterChips(hi, data) };
  }
  if (FOOD.test(text)) {
    return { text: hi ? 'आपके रास्ते के पास की दुकानें बाज़ार में हैं।' : 'Stalls and shops near your route are in the Bazaar.', cards: [{ kind: 'bazaar' }], chips: starterChips(hi, data) };
  }
  if (OPEN.test(text)) {
    // Open is a fact, not a recommendation: every place with hours on record for today, not only plannable ones.
    const rank = { good: 0, precautions: 1, confirm: 2, not: 3 } as const;
    const open = data.places
      .filter((p) => windowFor(data, p.units[0], today) && verdictToday(data, p, today) !== 'not')
      .sort((a, b) => rank[verdictToday(data, a, today)] - rank[verdictToday(data, b, today)]);
    const unknown = data.places.filter((p) => !windowFor(data, p.units[0], today)).length;
    return {
      text: hi
        ? `आज ये ${open.length} जगहें खुली हैं (हमारी जानकारी के अनुसार)। ${unknown} जगहों का समय अभी पता नहीं।`
        : `${open.length} places are open today, as far as our records show. ${unknown} more have no hours on record yet.`,
      cards: [{ kind: 'places', ids: open.map((p) => p.id) }],
      chips: starterChips(hi, data),
    };
  }
  return {
    text: hi ? 'मैं जगहों, टिकट, समय और आपके दिन के प्लान में मदद कर सकता हूँ।' : 'I can help with places, tickets, timings and planning your day.',
    cards: [],
    chips: starterChips(hi, data),
  };
}
