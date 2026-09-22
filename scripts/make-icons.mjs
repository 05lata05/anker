/**
 * Genera le icone dell'app.
 *
 * Il segno sono le tre barre del genere — blu `der`, rosso `die`, verde `das` —
 * sul fondo scuro dell'app. È l'unico uso forte del colore in tutto il prodotto
 * (§5.1), quindi è anche l'unica cosa che ha senso mettere sull'icona.
 *
 * Encoder PNG scritto a mano: servono sei file quadrati a tinte piatte, e
 * aggiungere una dipendenza di image processing per disegnare dei rettangoli
 * sarebbe sproporzionato.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const BG = [0x0b, 0x0c, 0x0e, 0xff];
const TRANSPARENT = [0, 0, 0, 0];
const BARS = [
  [0x25, 0x63, 0xeb, 0xff], // der
  [0xdc, 0x26, 0x26, 0xff], // die
  [0x16, 0xa3, 0x4a, 0xff], // das
];
const MONO = [0xff, 0xff, 0xff, 0xff];

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filtro "none"
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Tre barre orizzontali centrate. `scale` stringe il segno per lasciare il
 * margine di sicurezza che Android ritaglia sulle icone adattive.
 */
function bars({ background, colors, scale = 0.62 }) {
  return (size) => (x, y) => {
    const span = size * scale;
    const left = (size - span) / 2;
    const barHeight = span / 7;
    const gap = barHeight * 0.85;
    const totalHeight = barHeight * 3 + gap * 2;
    const top = (size - totalHeight) / 2;

    if (x < left || x > left + span) return background;

    for (let i = 0; i < 3; i++) {
      const barTop = top + i * (barHeight + gap);
      if (y >= barTop && y <= barTop + barHeight) {
        // Angoli smussati: raggio pari a metà altezza della barra.
        const r = barHeight / 2;
        const cy = barTop + r;
        const withinLeftCap = x < left + r;
        const withinRightCap = x > left + span - r;
        if (withinLeftCap || withinRightCap) {
          const cx = withinLeftCap ? left + r : left + span - r;
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return background;
        }
        return colors[i];
      }
    }
    return background;
  };
}

const targets = [
  { file: 'assets/images/icon.png', size: 1024, draw: bars({ background: BG, colors: BARS }) },
  { file: 'assets/images/splash-icon.png', size: 512, draw: bars({ background: TRANSPARENT, colors: BARS, scale: 0.9 }) },
  { file: 'assets/images/favicon.png', size: 64, draw: bars({ background: BG, colors: BARS }) },
  {
    file: 'assets/images/android-icon-foreground.png',
    size: 432,
    draw: bars({ background: TRANSPARENT, colors: BARS, scale: 0.44 }),
  },
  { file: 'assets/images/android-icon-background.png', size: 432, draw: () => () => BG },
  {
    file: 'assets/images/android-icon-monochrome.png',
    size: 432,
    draw: bars({ background: TRANSPARENT, colors: [MONO, MONO, MONO], scale: 0.44 }),
  },

  // Icone della versione web aggiunta alla schermata Home. Stanno in `public/`
  // e non in `assets/` perché il manifest e iOS le cercano a un percorso fisso:
  // se passassero dal bundler finirebbero sotto un nome con l'hash.
  { file: 'public/icons/apple-touch-icon.png', size: 180, draw: bars({ background: BG, colors: BARS }) },
  { file: 'public/icons/icon-192.png', size: 192, draw: bars({ background: BG, colors: BARS }) },
  { file: 'public/icons/icon-512.png', size: 512, draw: bars({ background: BG, colors: BARS }) },
  // «Maskable»: Android ritaglia l'icona in una forma che non conosciamo in
  // anticipo, quindi il segno sta dentro il cerchio di sicurezza.
  {
    file: 'public/icons/icon-512-maskable.png',
    size: 512,
    draw: bars({ background: BG, colors: BARS, scale: 0.44 }),
  },
];

const root = resolve(import.meta.dirname, '..');
for (const target of targets) {
  const path = resolve(root, target.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(target.size, target.draw(target.size)));
  console.log(`${target.file} — ${target.size}×${target.size}`);
}
