import { animate, motion, Reorder, useDragControls } from 'motion/react';
import { useEffect, useState } from 'react';
import { feeFor, fmt, haversineKm, isUnavailable, ROAD_FACTOR, SPEED_KMH, startCoord, startName, windowFor, type Data, type Leg, type Plan, type Stop } from '../../core';
import { useNav } from '../../nav';
import { award, nowMinIST, useStore } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { LABEL_TEXT, VERDICT_TEXT } from '../../ui/facts';
import { ART, PlaceCover, artFor } from '../../art/PlaceCover';
import { Icon } from '../../ui/Icon';
import { roundedStart } from './QuickPlan';

function CountUp({ to }: { to: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, to, { duration: 1.2, ease: 'easeOut', onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [to]);
  return <>{v}</>;
}

const REASON: Record<string, { en: string; hi: string }> = {
  noTime: { en: 'does not fit your time', hi: 'समय में फिट नहीं' },
  dislike: { en: 'you asked not to see this kind of place', hi: 'आपने ऐसी जगह न दिखाने को कहा' },
  hoursUnavailable: { en: 'opening hours not on record', hi: 'खुलने का समय दर्ज नहीं' },
  notFeasible: { en: 'not possible today', hi: 'आज संभव नहीं' },
};

const MODE = { walk: { en: 'walk', hi: 'पैदल' }, auto: { en: 'auto', hi: 'ऑटो' }, cab: { en: 'cab', hi: 'कैब' } };

function StopRow({ st, n, done, onTick, onRemove }: { st: Stop; n: number; done: boolean; onTick: () => void; onRemove: () => void }) {
  const { lang } = useTheme();
  const { open } = useNav();
  const drag = useDragControls();
  const vt = VERDICT_TEXT[st.check.verdict];
  const hi = lang === 'hi';
  return (
    <Reorder.Item value={st.unit.id} dragListener={false} dragControls={drag} className={`stop${done ? ' done' : ''}`} layout>
      <div className="leg-line small muted">
        <Icon name={st.leg.mode === 'walk' ? 'users' : 'route'} size={14} /> {st.leg.minutes + st.leg.buffer} min {MODE[st.leg.mode][lang]}
        {st.leg.fare && st.leg.fare.max > 0 && ` · ₹${st.leg.fare.min}–${st.leg.fare.max}`} · {hi ? 'अनुमान' : 'estimate'}
      </div>
      <div className="stop-card" style={{ ['--pc1' as string]: artFor(st.unit.id in ART ? st.unit.id : st.place.id).sky[0] }}>
        <span className="stop-thumb" aria-hidden="true">
          <PlaceCover id={st.unit.id in ART ? st.unit.id : st.place.id} height={64} />
        </span>
        <button className={`tick${done ? ' on' : ''}`} onClick={onTick} aria-pressed={done} aria-label={hi ? 'हो गया' : 'Mark done'}>
          {done ? <Icon name="check" size={18} /> : n}
        </button>
        <button className="stop-body" onClick={() => open({ kind: 'story', id: st.place.id })}>
          <b>{st.unit.name[lang]}</b>
          <span className="small muted">
            {fmt(st.arrive)}–{fmt(st.depart)} · {st.visit} min
          </span>
          <span className="stop-tags">
            <span className={`verdict ${vt.tone}`}>{vt[lang]}</span>
            {st.added && <span className="tag-added">{hi ? 'आपने जोड़ा, सुझाव नहीं' : 'Added by you, not suggested'}</span>}
            {st.wait > 0 && <span className="small muted">{hi ? `${st.wait} मिनट इंतज़ार` : `waits ${st.wait} min to open`}</span>}
          </span>
        </button>
        <button className="stop-remove" onClick={onRemove} aria-label={hi ? 'रोडमैप से हटाएँ' : 'Remove from roadmap'} title={hi ? 'हटाएँ' : 'Remove'}>
          <Icon name="x" size={16} />
        </button>
        <span className="grip" onPointerDown={(e) => drag.start(e)} aria-label={hi ? 'खींचें' : 'Drag to reorder'} role="button">
          <Icon name="grip" size={20} />
        </span>
      </div>
    </Reorder.Item>
  );
}

/** Open places the planner does not pick by itself (Decision 25: unticketed places, places of worship,
 * places without a custodian publication) but that are open on the day with known hours. One tap adds
 * one; the planner then fits it into the timeline like any place the raahi added by name. */
function AddToDay() {
  const { s, set, plan, data } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  if (!plan) return null;
  const inPlan = new Set(plan.stops.map((x) => x.place.id));
  const from = startCoord(data, plan.input.startPoint);
  const likes = new Set(plan.input.profile.likes);
  const options = data.places
    .filter((p) => !inPlan.has(p.id) && !s.added.includes(p.id))
    .map((p) => ({ p, w: windowFor(data, p.units[0], plan.input.date), km: haversineKm(from, p.units[0].coord) }))
    .filter((x) => x.w && x.w.close - Math.max(x.w.open, plan.startMin) >= 30 && x.w.open < plan.endMin && x.km <= 25)
    .sort((a, b) => b.p.tags.filter((t) => likes.has(t)).length - a.p.tags.filter((t) => likes.has(t)).length || a.km - b.km)
    .slice(0, 6);
  if (!options.length) return null;
  return (
    <section className="add-to-day">
      <h3 className="section-title">{hi ? 'अपने दिन में जोड़ें' : 'Add to your day'}</h3>
      <p className="small muted">{hi ? 'आज खुली जगहें जिन्हें हम अपने आप नहीं जोड़ते। टैप करें, रोडमैप में फ़िट हो जाएँगी।' : 'Open today, but not added by us on our own. Tap to add, and the roadmap fits them in.'}</p>
      {options.map(({ p, w, km }) => (
        <div key={p.id} className="card row">
          <button className="grow add-pick" onClick={() => open({ kind: 'place', id: p.id })}>
            <b>{p.name[lang]}</b>
            <small>{fmt(w!.open)}–{fmt(w!.close)} · {km.toFixed(1)} km{p.sensitive ? (hi ? ' · पहले नियम देखें' : ' · see the rules first') : ''}</small>
          </button>
          <button className="btn ghost small" onClick={() => set((c) => ({ added: [...c.added, p.id], removed: (c.removed ?? []).filter((x) => !p.units.some((u) => u.id === x)), order: null }))}>
            <Icon name="plus" size={16} /> {hi ? 'जोड़ें' : 'Add'}
          </button>
        </div>
      ))}
    </section>
  );
}

const MODE_WORD = { walk: { en: 'Walk', hi: 'पैदल' }, auto: { en: 'Auto', hi: 'ऑटो' }, cab: { en: 'Cab', hi: 'कैब' } } as const;
const WHO_WORD = { indian: { en: 'Indian', hi: 'भारतीय' }, foreign: { en: 'Foreign', hi: 'विदेशी' }, child: { en: 'Child', hi: 'बच्चा' } } as const;

/** Every rupee and minute in the plan, line by line, with where the number comes from. */
function Breakdown({ plan, data, lang }: { plan: Plan; data: Data; lang: 'en' | 'hi' }) {
  const hi = lang === 'hi';
  const src = (k?: string, ver?: string, s?: string) => {
    const name = k ? data.sources[k]?.name ?? k : hi ? 'स्रोत नहीं' : 'no source';
    const label = s ? LABEL_TEXT[s as keyof typeof LABEL_TEXT]?.[lang] ?? s : '';
    return `${name}${ver ? `, ${ver}` : ''}${label ? ` · ${label}` : ''}`;
  };
  const legLine = (l: Leg, from: string, to: string) => (
    <li key={`${from}-${to}`}>
      <b>{from} → {to}</b>: {MODE_WORD[l.mode][lang]}, ≈{l.km} km, {l.minutes} min + {l.buffer} min {hi ? 'बफ़र' : 'buffer'}
      {' · '}
      {l.mode === 'walk' ? (hi ? 'मुफ़्त' : 'free') : l.fare && l.fareBand ? `₹${l.fare.min}–${l.fare.max}${l.vehicles > 1 ? ` (${l.vehicles} ${hi ? 'वाहन' : 'vehicles'})` : ''}` : hi ? 'किराया पता नहीं' : 'fare not known'}
      {l.fareBand && <small className="muted"> — {l.fareBand.t?.[lang]} ({src(l.fareBand.src, l.fareBand.ver, l.fareBand.s)})</small>}
      {l.mode !== 'walk' && !l.fareBand && <small className="muted"> — {hi ? 'इस शहर/दूरी के लिए किराये का कोई स्रोत अभी नहीं' : 'no fare source for this city or distance yet'}</small>}
    </li>
  );
  const names = [startName(data, plan.input.startPoint)[lang], ...plan.stops.map((x) => x.unit.name[lang])];
  const seen = new Set<string>();
  return (
    <details className="breakdown">
      <summary>{hi ? 'यह कैसे निकला: हर रुपया और मिनट' : 'How this is worked out: every rupee and minute'}</summary>
      <h4>{hi ? 'टिकट' : 'Tickets'}</h4>
      <ul>
        {plan.stops.map((st) => {
          if (seen.has(st.unit.ticket)) {
            const first = plan.stops.find((x) => x.unit.ticket === st.unit.ticket)!;
            return <li key={st.unit.id}><b>{st.unit.name[lang]}</b>: {hi ? `${first.unit.name[lang]} वाला टिकट ही चलेगा, अलग नहीं लगता` : `covered by the same ticket as ${first.unit.name[lang]}`}</li>;
          }
          seen.add(st.unit.ticket);
          const f = st.unit.fees;
          const rows = (['indian', 'foreign', 'child'] as const).filter((w) => plan.input.group[w]).map((w) => {
            const n = plan.input.group[w];
            const each = feeFor(f.v, w, plan.input.payment);
            return `${n} × ${WHO_WORD[w][lang]} ${each ? `₹${each.min}${each.max !== each.min ? `–${each.max}` : ''} = ₹${each.min * n}${each.max !== each.min ? `–${each.max * n}` : ''}` : hi ? 'कीमत पता नहीं' : 'price not known'}`;
          });
          return (
            <li key={st.unit.ticket}>
              <b>{st.unit.name[lang]}</b>: {rows.join('; ')} <small className="muted">({isUnavailable(f) ? (hi ? 'कोई स्रोत नहीं' : 'no source found') : src(f.src, f.ver, f.s)}{f.s === 'conflicting' ? (hi ? '; स्रोत अलग-अलग, कम-ज़्यादा दोनों गिने' : '; sources disagree, the range covers both') : ''})</small>
            </li>
          );
        })}
      </ul>
      <h4>{hi ? 'सवारी' : 'Rides'}</h4>
      <ul>
        {plan.stops.map((st, i) => legLine(st.leg, names[i], names[i + 1]))}
        {plan.returnLeg && legLine(plan.returnLeg, names[names.length - 1], names[0])}
      </ul>
      <h4>{hi ? 'समय' : 'Time at each place'}</h4>
      <ul>
        {plan.stops.map((st) => {
          const w = windowFor(data, st.unit, plan.input.date);
          return (
            <li key={st.unit.id}>
              <b>{st.unit.name[lang]}</b>: {fmt(st.arrive)}–{fmt(st.depart)} ({st.visit} min {hi ? 'घूमना' : 'visit'} + {st.ticket} min {hi ? 'टिकट' : 'ticket'}{st.wait ? ` + ${st.wait} min ${hi ? 'इंतज़ार' : 'wait'}` : ''})
              <small className="muted"> — {w ? `${hi ? 'खुला' : 'open'} ${fmt(w.open)}–${fmt(w.close)} (${src(st.unit.hours.src, st.unit.hours.ver, st.unit.hours.s)})` : hi ? 'खुलने का समय पता नहीं: आपने जोड़ा इसलिए रखा, पहुँचकर पूछें' : 'opening hours not known: kept because you added it, ask on arrival'}</small>
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        {hi
          ? `सफ़र का समय अनुमान है: सीधी दूरी × ${ROAD_FACTOR} (सड़क), पैदल ${SPEED_KMH.walk}, ऑटो ${SPEED_KMH.auto}, कैब ${SPEED_KMH.cab} किमी/घंटा, और हर सफ़र पर 15 मिनट या 20% बफ़र (जो ज़्यादा)। घूमने का समय हमारी टीम का अनुमान है, आपकी "एक जगह पर सबसे ज़्यादा" सेटिंग तक।`
          : `Travel times are estimates: straight-line distance × ${ROAD_FACTOR} for roads, at ${SPEED_KMH.walk} km/h walking, ${SPEED_KMH.auto} km/h by auto and ${SPEED_KMH.cab} km/h by cab, plus a buffer of 15 minutes or 20% per ride, whichever is more. Visit lengths are our team's estimate, capped by your "longest at one place" setting.`}
      </p>
    </details>
  );
}

// R6 + R7: the roadmap as a timeline checklist, with "running late" and a rough budget.
export function RoadmapTab() {
  const { s, set, plan, data, today } = useStore();
  const { lang } = useTheme();
  const { open } = useNav();
  const hi = lang === 'hi';
  const [shared, setShared] = useState(false);

  if (!plan) {
    return (
      <div className="screen center">
        <h1 className="display">{hi ? 'अभी कोई रोडमैप नहीं' : 'No roadmap yet'}</h1>
        <p className="muted">{hi ? 'कुछ टैप में बनाएँ।' : 'Make one in a few taps.'}</p>
        <button className="btn primary big" onClick={() => open({ kind: 'quick' })}>
          <Icon name="sparkle" size={18} /> {hi ? 'दिन प्लान करें' : 'Plan my day'}
        </button>
      </div>
    );
  }

  const ids = plan.stops.map((x) => x.unit.id);
  const doneCount = ids.filter((id) => s.done.includes(id)).length;
  const next = plan.stops.find((x) => !s.done.includes(x.unit.id));
  const now = nowMinIST();
  const live = now >= plan.startMin && now <= plan.endMin;
  const left = live ? plan.endMin - now : plan.endMin - plan.startMin;
  const start = { name: startName(data, plan.input.startPoint) };
  const b = plan.budget;

  // Replan from now: keep what is done as done, and let the rules fill the time that is left.
  const late = () => {
    const hoursLeft = Math.max(1, Math.round((plan.endMin - Math.max(now, plan.startMin)) / 30) / 2);
    set((c) => ({ quick: c.quick && { ...c.quick, start: roundedStart(), hours: hoursLeft }, order: null, skip: [...new Set([...c.skip, ...c.done])] }));
  };

  const share = async () => {
    const text = `My Dishaara roadmap (${today}): ` + plan.stops.map((x) => `${fmt(x.arrive)} ${x.unit.name.en}`).join(', ');
    try {
      if (navigator.share) await navigator.share({ title: 'Dishaara roadmap', text });
      else await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      /* the visitor closed the share sheet */
    }
  };

  return (
    <div className="screen">
      <motion.div className="time-strip" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <Icon name="clock" size={18} />
        <span>
          <b>{Math.floor(left / 60)} h {left % 60} m</b> {hi ? 'बाकी' : 'left'}
          {next && (
            <>
              {' · '}
              {hi ? 'अगला' : 'next'}: <b>{next.unit.name[lang]}</b> {fmt(next.arrive)}
            </>
          )}
          {' · '}
          {hi ? 'वापसी' : 'back by'} {fmt(plan.finish)}
        </span>
      </motion.div>

      <div className="road-head">
        <h1 className="display small">{hi ? 'आज का रोडमैप' : "Today's roadmap"}</h1>
        <button className="icon-btn" onClick={share} aria-label={hi ? 'शेयर' : 'Share'}>
          <Icon name={shared ? 'check' : 'share'} size={18} />
        </button>
      </div>
      <p className="muted small">
        {hi ? 'शुरू' : 'From'} {start?.name[lang]} · {fmt(plan.startMin)} · {plan.stops.length} {hi ? 'जगहें' : 'stops'} · {hi ? 'फ़ोन में सेव, ऑफ़लाइन भी चलेगा' : 'saved on this phone for offline use'}
      </p>

      <div className="road-progress" aria-hidden="true">
        <motion.span initial={false} animate={{ scaleX: plan.stops.length ? doneCount / plan.stops.length : 0 }} transition={{ type: 'spring', damping: 20 }} />
      </div>

      {s.skip.length > 0 && (
        <div className="done-today">
          <span className="small muted">{hi ? 'आज हो चुका' : 'Done today'}</span>
          {s.skip.map((id) => (
            <span key={id} className="chip tiny done-chip"><Icon name="check" size={12} /> {data.places.flatMap((p) => p.units).find((u) => u.id === id)?.name[lang] ?? id}</span>
          ))}
        </div>
      )}

      {(s.removed ?? []).length > 0 && (
        <div className="done-today">
          <span className="small muted">{hi ? 'आपने हटाया (वापस जोड़ने के लिए टैप करें)' : 'You removed (tap to put back)'}</span>
          {(s.removed ?? []).map((id) => (
            <button key={id} className="chip tiny" onClick={() => set((c) => ({ removed: c.removed.filter((x) => x !== id), order: null }))}>
              <Icon name="plus" size={12} /> {data.places.flatMap((p) => p.units).find((u) => u.id === id)?.name[lang] ?? id}
            </button>
          ))}
        </div>
      )}

      <Reorder.Group axis="y" values={ids} onReorder={(o) => set({ order: o })} className="stops">
        {plan.stops.map((st, i) => (
          <StopRow key={st.unit.id} st={st} n={i + 1} done={s.done.includes(st.unit.id)} onTick={() => set((c) => (c.done.includes(st.unit.id) ? { done: c.done.filter((x) => x !== st.unit.id) } : { done: [...c.done, st.unit.id], ...award(c, `tick:${st.unit.id}`, 10) }))}
            onRemove={() => set((c) => ({ removed: [...new Set([...(c.removed ?? []), st.unit.id])], added: st.place.units.every((x) => x.id === st.unit.id || (c.removed ?? []).includes(x.id)) ? c.added.filter((x) => x !== st.place.id) : c.added, order: c.order?.filter((x) => x !== st.unit.id) ?? null }))} />
        ))}
      </Reorder.Group>
      <AddToDay />

      {plan.returnLeg && (
        <p className="small muted">
          {hi ? 'वापसी' : 'Back to'} {start?.name[lang]}: {plan.returnLeg.minutes + plan.returnLeg.buffer} min · {fmt(plan.finish)}
        </p>
      )}

      <div className="row-actions">
        <button className="btn ghost" onClick={late}>
          <Icon name="clock" size={18} /> {hi ? 'मुझे देर हो रही है' : "I'm running late"}
        </button>
        <button className="btn ghost" onClick={() => open({ kind: 'quick' })}>
          <Icon name="edit" size={18} /> {hi ? 'फिर से प्लान' : 'Re-plan'}
        </button>
      </div>

      <div className="budget card">
        <Icon name="wallet" size={22} />
        <div className="grow">
          <b>{hi ? 'बजट (मोटा अनुमान)' : 'Budget (rough estimate)'}</b>
          <div className="budget-row">
            <span>{hi ? 'टिकट' : 'Tickets'}</span>
            <span>₹<CountUp to={b.fees.min} />{b.fees.max !== b.fees.min && `–${b.fees.max}`}</span>
          </div>
          <div className="budget-row">
            <span>{hi ? 'सवारी' : 'Rides'}</span>
            <span>₹<CountUp to={b.fares.min} />–{b.fares.max}</span>
          </div>
          <div className="budget-row total">
            <span>{hi ? 'कुल' : 'Total'}</span>
            <span>₹<CountUp to={b.total.min} />–{b.total.max}</span>
          </div>
          {b.total.partial && <p className="small muted">{hi ? 'कुछ कीमतें पता नहीं, इसलिए कुल अधूरा है।' : 'Some prices are unknown, so the total is partial.'}</p>}
        </div>
      </div>
      <Breakdown plan={plan} data={data} lang={lang} />

      {plan.leftOut.length > 0 && (
        <details className="left-out">
          <summary>{hi ? 'जो शामिल नहीं हुआ' : 'Not included'} ({plan.leftOut.length})</summary>
          <ul>
            {plan.leftOut.map((x) => (
              <li key={x.unit.id}>
                {x.unit.name[lang]}: <span className="muted">{(REASON[x.reason] ?? REASON.noTime)[lang]}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
