// Painted art made on Aditya's laptop with a free local image model (C:\projects\imagegen) and
// checked by eye against each real place. Files are in public/art. Anything not listed keeps its
// code-drawn art. These are illustrations, never photos of the place.
const PAINTED = {
  covers: [
    'gwalior-fort', 'fort-asi', 'fort-asi-museum', 'fort-gujari', 'fort-state-palaces', 'sas-bahu', 'teli-ka-mandir', 'gurudwara-data-bandi-chhod', 'jai-vilas', 'tansen-tomb', 'ghaus-tomb', 'suraj-kund', 'sun-temple',
    'light-sound-show', 'tighra-dam', 'db-city-mall', 'phool-bagh',
    // Indore. Annapurna and Choral Dam were redrawn on 28 Oct (the first tries had live elephants and Himalayan pines).
    'rajwada', 'lal-bagh', 'central-museum', 'sarafa', 'kanch-mandir', 'khajrana', 'bada-ganpati', 'krishnapura-chhatri', '56-dukan',
    'phoenix-citadel', 'treasure-island', 'meghdoot-garden', 'mrignayani', 'gulawat-lotus-valley', 'ralamandal', 'patalpani',
    // 28 Oct: every other place, so no stamp or banner falls back to drawn shapes (Aditya: stamps are AI art).
    'abul-fazal-tomb', 'annapurna', 'assi-khamba-bawri', 'bateshwar', 'bhim-janmabhoomi', 'bijasan-mata', 'chaturbhuj-temple', 'choral-dam',
    'gandhi-hall', 'geoscience-museum', 'ghatigaon', 'gohad-fort', 'gommatgiri', 'gopachal', 'gwalior-zoo', 'indore-zoo', 'italian-garden',
    'jam-gate', 'maharaj-bada', 'mitaoli', 'moti-mahal', 'pitra-parvat', 'rani-samadhi', 'regional-park', 'sarafa-gwalior', 'scindia-chhatris',
    'sirpur-lake', 'padavali', 'sarod-ghar',
  ],
  banners: ['dusk', 'marigold', 'monsoon', 'diwali', 'peacock', 'stars'],
  // No tabla: the model could not draw one correctly.
  avatars: ['peacock', 'lotus', 'diya', 'elephant', 'kite', 'tiger', 'fort'],
};

export function paintedArt(group: keyof typeof PAINTED, id: string): string | null {
  return PAINTED[group].includes(id) ? `${import.meta.env.BASE_URL}art/${group}/${id}.webp` : null;
}
