// Rule-based chat used in the demo when no model is connected. Answers come from the same
// stored facts and rules as the rest of the app, so it never invents anything. On the event day
// the backend chatbot (Groq, behind the RAG agent) replaces respond() with the same reply shape.
import { checkUnit, confirmItems, feeFor, fmt, guardrail, parseTrip, promotable, rankedPlaces, windowFor, type Data, type Place, type Plan } from '../core';
import type { Lang } from '../theme/ThemeProvider';

export type Card = { kind: 'place'; id: string } | { kind: 'places'; ids: string[] } | { kind: 'quick'; hours?: number } | { kind: 'bazaar' } | { kind: 'sos' } | { kind: 'roadmap' };
export type Reply = { text: string; cards: Card[]; chips: string[] };

const EMERGENCY = /emergency|ambulance|police|hospital|injur|accident|unsafe|help me|आपात|एम्बुलेंस|पुलिस|अस्पताल|मदद/i;
const PLAN = /plan|itinerar|trip|day out|hours?\b|roadmap|घंटे|प्लान|योजना|घूम/i;
const OPEN = /open|today|खुला|आज/i;
const FEE = /ticket|fee|price|cost|₹|टिकट|शुल्क|कीमत/i;
const FOOD = /food|eat|lunch|snack|shop|souvenir|खाना|नाश्ता|दुकान/i;
const FOLLOW = /(this|that|it|there|these|those|listed|where is|how far|how long|get there)|यह|वह|वहाँ|कहाँ/i;
const MYDAY = /my (plan|day|roadmap|trip)|roadmap|schedule|timeline|budget|total cost|cost of (my|the) day|how much (will|does) (it|my day)|मेरा (प्लान|दिन)|रोडमैप|बजट|कुल खर्च/i;
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

const SURE: Record<string, { en: string; hi: string }> = {
  'officially confirmed': { en: 'officially confirmed', hi: 'आधिकारिक रूप से पुष्ट' },
  'locally verified': { en: 'checked on site', hi: 'मौके पर जाँचा' },
  'recently reported': { en: 'recently reported', hi: 'हाल में बताया गया' },
  unverified: { en: 'not verified', hi: 'असत्यापित' },
  conflicting: { en: 'sources disagree', hi: 'स्रोत अलग-अलग' },
  'potentially outdated': { en: 'may be outdated', hi: 'पुराना हो सकता है' },
  estimated: { en: 'estimate', hi: 'अनुमान' },
  'historical pattern': { en: 'past pattern', hi: 'पुराना पैटर्न' },
};
const day = (iso?: string) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

/** The same card layout the AI uses: a bold answer, labelled bullets from the record, a planning question. */
export type Alerts = { closed: string[]; crowded?: string[] };

export function placeCard(data: Data, p: Place, today: string, lang: Lang, tw?: Alerts): string {
  const hi = lang === 'hi';
  const u = p.units[0];
  const c = checkUnit(data, u, today);
  const say = {
    good: hi ? 'आज जा सकते हैं।' : 'You can go today.',
    precautions: hi ? 'आज जा सकते हैं, कुछ सावधानी के साथ।' : 'You can go today, with a few cautions.',
    confirm: hi ? 'जाने से पहले एक बात पक्की करें।' : 'Check one thing before you go.',
    not: hi ? 'आज संभव नहीं लगता।' : 'It does not look possible today.',
  }[c.verdict];
  const lines = [`**${p.name[lang]}: ${say}**`];
  // A moderator's alert comes first, before anything else about the place.
  const part = (ids: string[]) => { const hit = p.units.filter((x) => ids.includes(x.id)); return hit.length ? (hit.length < p.units.length ? `${hit.map((x) => x.name[lang]).join(', ')}: ` : '') : null; };
  const shut = part(tw?.closed ?? []);
  const busy = part(tw?.crowded ?? []);
  if (shut !== null) lines.push(`- **${hi ? 'अभी' : 'Right now'}:** ${shut}${hi ? 'आज बंद (मॉडरेटर सूचना)।' : 'closed today (moderator alert).'}`);
  if (busy !== null) lines.push(`- **${hi ? 'अभी' : 'Right now'}:** ${busy}${hi ? 'बहुत भीड़ (मॉडरेटर सूचना)। कतार लंबी, समय ज़्यादा लगेगा। फ़ोन-पर्स संभालें, हो सके तो बाद में जाएँ।' : 'very crowded (moderator alert). Long queues, so it takes longer than usual. Keep your phone and wallet close, and go later if you can.'}`);
  const w = windowFor(data, u, today);
  const sure = (s?: string, ver?: string) => (s ? ` (${SURE[s]?.[lang] ?? s}${ver ? `, ${day(ver)}` : ''})` : '');
  if (w) lines.push(`- **${hi ? 'समय' : 'Hours'}:** ${fmt(w.open)} to ${fmt(w.close)}${sure(u.hours.s, u.hours.ver)}`);
  else lines.push(`- **${hi ? 'समय' : 'Hours'}:** ${hi ? 'हमारे पास दर्ज नहीं' : 'not on record yet'}`);
  const fee = u.fees.v?.rows.find((r) => r.who === 'indian');
  const price = fee ? (fee.cash ?? fee.any ?? fee.online) : undefined;
  if (u.fees.s === 'conflicting') lines.push(`- **${hi ? 'टिकट' : 'Ticket'}:** ${hi ? 'कीमत पक्की नहीं, स्रोत अलग-अलग' : 'price not confirmed, sources disagree'}`);
  else if (price !== undefined && price !== null) lines.push(`- **${hi ? 'टिकट' : 'Ticket'}:** ${price === 0 ? (hi ? 'मुफ़्त' : 'free') : `₹${price}`} ${hi ? '(भारतीय)' : '(Indian visitor)'}${sure(u.fees.s, u.fees.ver)}`);
  const conf = confirmItems(c, lang);
  if (conf.length) lines.push(`- **${hi ? 'पहले जाँचें' : 'Check first'}:** ${conf.join('; ')}`);
  const tip = p.rules.find((r) => r.t?.[lang])?.t?.[lang];
  if (tip) lines.push(`- **${hi ? 'जानने लायक' : 'Good to know'}:** ${tip}`);
  lines.push(hi ? '*इसे अपने रोडमैप में जोड़ें?*' : '*Add it to your roadmap?*');
  return lines.join('\n');
}

/** The roadmap as a table: every stop with its time, ride and ticket, the ride back, and the totals. */
export function planTable(plan: Plan, lang: Lang, payment: 'cash' | 'online' = 'cash'): string {
  const hi = lang === 'hi';
  const r = (x: { min: number; max: number } | null | undefined) => (!x ? (hi ? 'पता नहीं' : 'not known') : x.max === 0 ? (hi ? 'मुफ़्त' : 'free') : x.min === x.max ? `₹${x.min}` : `₹${x.min}–${x.max}`);
  const MODE = { walk: hi ? 'पैदल' : 'walk', auto: hi ? 'ऑटो' : 'auto', cab: hi ? 'कैब' : 'cab' };
  const rows = plan.stops.map((st) => `| ${fmt(st.arrive)}–${fmt(st.depart)} | ${st.unit.name[lang]} | ${MODE[st.leg.mode]} ${st.leg.minutes + st.leg.buffer} min, ${r(st.leg.fare)} | ${r(feeFor(st.unit.fees.v, 'indian', payment))} |`);
  const back = plan.returnLeg ? [`| ${hi ? 'वापसी' : 'back by'} ${fmt(plan.finish)} | ${hi ? 'शुरुआत पर' : 'to your start'} | ${MODE[plan.returnLeg.mode]} ${plan.returnLeg.minutes + plan.returnLeg.buffer} min, ${r(plan.returnLeg.fare)} | |`] : [];
  return [
    hi ? `**आपका दिन: ${plan.stops.length} जगहें**` : `**Your day: ${plan.stops.length} stops**`,
    hi ? '| समय | जगह | सवारी | टिकट (हर व्यक्ति) |' : '| Time | Place | Ride there | Ticket each |',
    '|---|---|---|---|',
    ...rows,
    ...back,
    hi
      ? `**कुल:** टिकट ${r(plan.budget.fees)}, सवारी ${r(plan.budget.fares)}, कुल ${r(plan.budget.total)} (अनुमान)`
      : `**Total:** tickets ${r(plan.budget.fees)}, rides ${r(plan.budget.fares)}, all in ${r(plan.budget.total)} (estimate)`,
    hi ? '*रोडमैप टैब में हर रुपये का हिसाब है।*' : '*The Roadmap tab shows how every rupee is worked out.*',
  ].join('\n');
}

export function respond(text: string, data: Data, today: string, lang: Lang, last: string[] = [], plan?: Plan | null, payment: 'cash' | 'online' = 'cash', tw?: Alerts): Reply {
  const hi = lang === 'hi';
  // "My plan", "budget", "schedule" with a roadmap made: the whole day as a table. Without one, the planner below answers.
  if (MYDAY.test(text) && !/plan (my|a|the) day|प्लान करो/i.test(text) && !rankedPlaces(data, text).length && plan?.stops.length)
    return { text: planTable(plan, lang, payment), cards: [{ kind: 'roadmap' }], chips: starterChips(hi, data) };
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
    return { text: placeCard(data, p, today, lang, tw), cards: [{ kind: 'place', id }], chips: starterChips(hi, data) };
  }
  if (named.length) {
    const p = data.places.find((x) => x.id === named[0])!;
    return { text: placeCard(data, p, today, lang, tw), cards: [{ kind: 'place', id: p.id }], chips: starterChips(hi, data) };
  }
  if (PLAN.test(text)) {
    const hours = trip.hours && trip.hours <= 12 ? Math.round(trip.hours) : undefined;
    return { text: hi ? 'आपका दिन कुछ टैप में बनाते हैं।' : "Let's build your day in a few taps.", cards: [{ kind: 'quick', hours }], chips: [] };
  }
  if (LESSER.test(text)) {
    const ids = data.places.filter((p) => promotable(p, today)).map((p) => p.id);
    return ids.length
      ? { text: hi ? 'ये जगहें संरक्षकों ने सुझाई हैं:' : 'Places their custodians are happy to see more visitors at:', cards: [{ kind: 'places', ids: ids.slice(0, 3) }], chips: starterChips(hi, data) }
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
      text: [
        hi ? `**आज ${open.length} जगहें खुली हैं** (हमारी जानकारी के अनुसार):` : `**${open.length} places are open today**, as far as our records show:`,
        ...open.slice(0, 5).map((p) => { const w = windowFor(data, p.units[0], today)!; return `- **${p.name[lang]}**: ${fmt(w.open)} to ${fmt(w.close)}`; }),
        open.length > 5 ? (hi ? `बाकी ${open.length - 5} नक्शा टैब में हैं। ${unknown} जगहों का समय अभी दर्ज नहीं।` : `${open.length - 5} more are on the Map tab. ${unknown} places have no hours on record yet.`) : '',
        hi ? '*किसके बारे में और जानना है?*' : '*Which one should I tell you more about?*',
      ].filter(Boolean).join('\n'),
      cards: [{ kind: 'places', ids: open.slice(0, 3).map((p) => p.id) }],
      chips: starterChips(hi, data),
    };
  }
  return {
    text: hi ? 'मैं जगहों, टिकट, समय और आपके दिन के प्लान में मदद कर सकता हूँ।' : 'I can help with places, tickets, timings and planning your day.',
    cards: [],
    chips: starterChips(hi, data),
  };
}
