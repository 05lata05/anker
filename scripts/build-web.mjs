/**
 * Costruisce la versione web pronta per un hosting statico.
 *
 *   node scripts/build-web.mjs            → sito alla radice del dominio
 *   ANKER_BASE_URL=/anker node scripts/…  → sito in un sottopercorso
 *
 * Oltre all'export fa una cosa che Expo non fa: duplica `index.html` in
 * `404.html`. Le rotte con parametro (`/item/42`) non hanno un file
 * corrispondente, e un hosting statico risponderebbe 404 a chi le apre o
 * ricarica. GitHub Pages serve `404.html` in quel caso: dentro c'è l'app
 * intera, che legge l'indirizzo e mostra la schermata giusta.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });

/**
 * Accetta `anker`, `/anker` o `/anker/` e restituisce sempre `/anker`.
 *
 * La forma senza barra iniziale è quella da preferire su Git Bash: la sua
 * traduzione automatica dei percorsi trasforma un valore che comincia per `/`
 * in un percorso Windows, e `/anker` diventa `C:/Program Files/Git/anker`.
 * Finiva dentro l'HTML come indirizzo del bundle, e il risultato era una
 * pagina bianca senza un solo errore in console.
 */
function normalizzaBase(valore) {
  const grezzo = (valore ?? '').trim();
  if (!grezzo) return '';
  if (/^[A-Za-z]:[\/]|\\/.test(grezzo)) {
    throw new Error(
      `ANKER_BASE_URL sembra un percorso Windows: «${grezzo}».
` +
        'Su Git Bash usa la forma senza barra iniziale, per esempio ANKER_BASE_URL=anker'
    );
  }
  return '/' + grezzo.replace(/^\/+/, '').replace(/\/+$/, '');
}

const base = normalizzaBase(process.env.ANKER_BASE_URL);
console.log(base ? `Base URL: ${base}` : 'Base URL: radice del dominio');

// Si invoca il file JS della CLI con Node, non il `.cmd` del binario e non
// `npx` dentro una shell: Node rifiuta di lanciare uno script batch senza
// shell, e la shell concatenerebbe gli argomenti senza quotarli — su Windows
// il percorso di questo progetto contiene uno spazio.
execFileSync(process.execPath, [resolve(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ANKER_BASE_URL: base },
});

const index = resolve(dist, 'index.html');
if (!existsSync(index)) throw new Error('export finito senza index.html');
copyFileSync(index, resolve(dist, '404.html'));
console.log('404.html scritto (istradamento delle rotte con parametro)');
