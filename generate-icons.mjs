import sharp from 'sharp';
import { readFileSync } from 'fs';

const svg = readFileSync('./public/pwa-icon.svg');

await sharp(svg).resize(192, 192).png().toFile('./public/pwa-192.png');
console.log('✓ pwa-192.png');

await sharp(svg).resize(512, 512).png().toFile('./public/pwa-512.png');
console.log('✓ pwa-512.png');

// Apple touch icon (180x180)
await sharp(svg).resize(180, 180).png().toFile('./public/apple-touch-icon.png');
console.log('✓ apple-touch-icon.png');
