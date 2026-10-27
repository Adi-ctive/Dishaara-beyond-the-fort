// Writes the code-drawn art out as plain SVG files, used as starting images for the local
// image model (C:\projects\imagegen). Run: npx vite-node scripts/export_art.tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { ART, PlaceCover } from '../src/art/PlaceCover';
import { AVATARS, Avatar, BANNERS, Banner } from '../src/art/Avatars';

const out = 'C:/projects/imagegen/svg';
const save = (dir: string, name: string, el: JSX.Element) => {
  mkdirSync(`${out}/${dir}`, { recursive: true });
  const svg = renderToStaticMarkup(el).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  writeFileSync(`${out}/${dir}/${name}.svg`, svg);
};

for (const id of Object.keys(ART)) save('covers', id, <PlaceCover id={id} />);
for (const b of BANNERS) save('banners', b.id, <Banner id={b.id} />);
for (const a of AVATARS) save('avatars', a.id, <Avatar id={a.id} size={512} />);
console.log('exported', Object.keys(ART).length, 'covers,', BANNERS.length, 'banners,', AVATARS.length, 'avatars');
