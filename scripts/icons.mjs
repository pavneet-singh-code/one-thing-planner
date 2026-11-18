// Renders the app icons from SVG. Run: npm run icons
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#11161d"/>
  <g transform="translate(256 256) scale(${pad ? 0.72 : 1}) translate(-256 -256)">
    <rect x="96" y="292" width="320" height="86" rx="14" fill="#f2d33b" transform="rotate(-4 256 335)"/>
    <path d="M226 128 L290 104 L290 360 L242 360 L242 166 L214 176 Z" fill="#e8edf4"/>
  </g>
</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M42 18 L58 12 L58 80 L46 80 L46 28 L38 31 Z" fill="#fff"/></svg>`;

writeFileSync('public/favicon.svg', icon(false));
await sharp(Buffer.from(icon(false))).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(Buffer.from(icon(false))).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(Buffer.from(icon(true))).resize(512, 512).png().toFile('public/icon-maskable-512.png');
await sharp(Buffer.from(badge)).resize(96, 96).png().toFile('public/badge-96.png');
console.log('icons written to public/');
