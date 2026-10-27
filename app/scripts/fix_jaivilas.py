# Applies Priyangi's closed validation record (16 Oct, Fact 2) to Jai Vilas:
# published pages differ on price and Monday opening, operator not confirmed.
import json, sys

p = sys.argv[1]
d = json.load(open(p, encoding='utf-8'))
jv = next(x for x in d['places'] if x['id'] == 'jai-vilas')
why = {
    'en': 'Published online information differs regarding ticket prices and Monday opening. Current prices, ticket inclusions and opening arrangements have not been confirmed. Please verify these details with the venue before visiting.',
    'hi': 'टिकट कीमत और सोमवार को खुलने के बारे में ऑनलाइन जानकारी अलग-अलग है। मौजूदा कीमत, टिकट में क्या शामिल है और खुलने का समय पक्का नहीं है। जाने से पहले स्थल से पुष्टि करें।',
}
for u in jv['units']:
    for k in ('hours', 'weeklyClosed', 'fees'):
        u[k]['s'] = 'conflicting'
        u[k]['why'] = why
json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('ok')
