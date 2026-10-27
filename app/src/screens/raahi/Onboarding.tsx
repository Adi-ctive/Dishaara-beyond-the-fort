import { motion } from 'motion/react';
import { useState } from 'react';
import { INTERESTS } from '../../data/demo';
import { useNav } from '../../nav';
import { promptFrom, useStore, type Prefs } from '../../store';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../ui/Icon';
import { LayerPage, Seg, Toggle } from '../../ui/Layer';

// R1 + R2: what the raahi enjoys (like Netflix or Spotify), then their own travel style.
// Only things about the person live here. Who is coming, how they get around and when they start
// change every trip, so the trip planner asks those (QuickPlan).
export function Onboarding() {
  const { s, set } = useStore();
  const { lang } = useTheme();
  const { back } = useNav();
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<string[]>(s.interests);
  const [prefs, setPrefs] = useState<Prefs>(s.prefs);
  const hi = lang === 'hi';
  const t = (en: string, hin: string) => (hi ? hin : en);
  const put = (patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const foodie = picked.includes('food');

  const finish = (skip: boolean) => {
    const interests = skip ? [] : picked;
    set({ onboarded: true, interests, prefs: skip ? s.prefs : prefs, prompt: skip ? [] : promptFrom(interests, prefs), order: null });
    back();
  };

  return (
    <LayerPage title={step === 0 ? t('What do you enjoy?', 'आपको क्या पसंद है?') : t('Your travel style', 'आपका घूमने का तरीका')} actions={<button className="link" onClick={() => finish(true)}>{t('Skip', 'छोड़ें')}</button>}>
      <div className="steps" aria-hidden="true">
        <i className="on" />
        <i className={step >= 1 ? 'on' : ''} />
      </div>

      {step === 0 ? (
        <>
          <p className="muted">{t('Pick as many as you like. Suggestions follow these.', 'जितने चाहें चुनें। इससे सुझाव आपके लिए बनते हैं।')}</p>
          <div className="interest-grid">
            {INTERESTS.map((it, i) => {
              const on = picked.includes(it.id);
              return (
                <motion.button key={it.id} className={`interest${on ? ' on' : ''}`} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== it.id) : [...p, it.id]))}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} whileTap={{ scale: 0.95 }} aria-pressed={on}>
                  <span className="interest-emoji" aria-hidden="true">{it.icon}</span>
                  <span>{it[lang]}</span>
                  {on && <Icon name="check" size={16} className="interest-check" />}
                </motion.button>
              );
            })}
          </div>
          <button className="btn primary big sticky-cta" onClick={() => setStep(1)}>
            {t('Next', 'आगे')} {picked.length > 0 && `· ${picked.length}`}
          </button>
        </>
      ) : (
        <div className="form">
          <div className="field">
            <span>{t('Pace', 'घूमने की गति')}</span>
            <Seg value={prefs.pace} onChange={(v) => put({ pace: v })} options={[{ v: 'relaxed', label: t('Relaxed', 'आराम से') }, { v: 'normal', label: t('Normal', 'सामान्य') }, { v: 'fast', label: t('See a lot', 'ज़्यादा देखें') }]} />
          </div>
          <div className="field">
            <span>{t('Walking between places', 'जगहों के बीच पैदल')}</span>
            <Seg value={prefs.walking} onChange={(v) => put({ walking: v })} options={[{ v: 'low', label: t('Little', 'कम') }, { v: 'medium', label: t('Some', 'ठीक') }, { v: 'high', label: t('Lots', 'ज़्यादा') }]} />
          </div>
          <div className="field">
            <span>{t('Longest at one place', 'एक जगह पर ज़्यादा से ज़्यादा')}</span>
            <Seg value={prefs.maxPerPlace} onChange={(v) => put({ maxPerPlace: v })} options={[{ v: 30, label: '30 min' }, { v: 60, label: '1 h' }, { v: 120, label: '2 h' }]} />
          </div>
          <div className="field">
            <span>{t('Usual spend for a day, per person', 'एक दिन का आम खर्च, प्रति व्यक्ति')}</span>
            <Seg value={prefs.budget} onChange={(v) => put({ budget: v })} options={[{ v: 'low', label: t('Under ₹500', '₹500 से कम') }, { v: 'medium', label: '₹500–1,500' }, { v: 'high', label: t('Over ₹1,500', '₹1,500 से ज़्यादा') }]} />
          </div>
          <div className="field">
            <span>{t('You usually pay by', 'आप आमतौर पर भुगतान करते हैं')}</span>
            <Seg value={prefs.payment} onChange={(v) => put({ payment: v })} options={[{ v: 'online', label: t('UPI or card', 'UPI या कार्ड') }, { v: 'cash', label: t('Cash', 'नकद') }]} />
            <small className="muted">{t('ASI monuments charge less when you pay online.', 'ASI स्मारकों में ऑनलाइन भुगतान सस्ता पड़ता है।')}</small>
          </div>
          {foodie && (
            <div className="field">
              <span>{t('Food', 'खाना')}</span>
              <Seg value={prefs.food} onChange={(v) => put({ food: v })} options={[{ v: 'street', label: t('Street food', 'स्ट्रीट फ़ूड') }, { v: 'veg', label: t('Veg only', 'सिर्फ़ शाकाहारी') }, { v: 'any', label: t('Anything', 'कुछ भी') }]} />
            </div>
          )}
          <Toggle on={prefs.access} onChange={(v) => put({ access: v, ...(v ? { walking: 'low' as const } : {}) })} label={t('I use a wheelchair or avoid stairs', 'मैं व्हीलचेयर इस्तेमाल करता/करती हूँ या सीढ़ियों से बचता/बचती हूँ')} />
          {prefs.access && <p className="muted small">{t('We will tell you plainly where step-free access is not known yet. Most forts have steep paths.', 'जहाँ बिना सीढ़ी का रास्ता पता नहीं है, हम साफ़ बताएँगे। ज़्यादातर किलों में चढ़ाई है।')}</p>}
          <Toggle on={prefs.worship} onChange={(v) => put({ worship: v })} label={t('Show places of worship', 'पूजा स्थल दिखाएँ')} />
          <p className="muted small">{t('We never ask your religion. Only what you want to see.', 'हम आपका धर्म नहीं पूछते। सिर्फ़ यह कि आप क्या देखना चाहते हैं।')}</p>
          <label className="field">
            <span>{t('Anything else about you?', 'आपके बारे में कुछ और?')}</span>
            <textarea rows={2} maxLength={200} value={prefs.note} onChange={(e) => put({ note: e.target.value })} placeholder={t('e.g. I love quiet places, I get tired in the heat', 'जैसे: मुझे शांत जगहें पसंद हैं, गर्मी में जल्दी थक जाता हूँ')} />
          </label>
          <button className="btn primary big" onClick={() => finish(false)}>{t('Done', 'हो गया')}</button>
        </div>
      )}
    </LayerPage>
  );
}
