/**
 * Il pacchetto A1, unito dai file per argomento e validato una volta sola.
 *
 * Se un contenuto è malformato l'errore esce qui, all'import: meglio un crash
 * al primo avvio in sviluppo che un item senza plurale scoperto tre settimane
 * dopo dentro una sessione.
 */
import acquisti from '../../../content/a1/acquisti.json';
import casa from '../../../content/a1/casa.json';
import cibo from '../../../content/a1/cibo.json';
import famiglia from '../../../content/a1/famiglia.json';
import lavoro from '../../../content/a1/lavoro.json';
import numeriOrari from '../../../content/a1/numeri-orari.json';
import presentarsi from '../../../content/a1/presentarsi.json';
import quotidiano from '../../../content/a1/quotidiano.json';
import ristorante from '../../../content/a1/ristorante.json';
import salute from '../../../content/a1/salute.json';
import saluti from '../../../content/a1/saluti.json';
import tempoLibero from '../../../content/a1/tempo-libero.json';
import trasporti from '../../../content/a1/trasporti.json';
import { type ContentFragment, mergeFragments, parseContentPack } from './contentSchema';

const FRAGMENTS: ContentFragment[] = [
  saluti,
  presentarsi,
  quotidiano,
  numeriOrari,
  famiglia,
  cibo,
  ristorante,
  casa,
  trasporti,
  lavoro,
  tempoLibero,
  acquisti,
  salute,
];

const NOTES =
  'I freqRank sono stime d’ordine di grandezza sul tedesco parlato, non ranghi presi da un corpus licenziato: ' +
  'servono al selettore i+1 per ordinare, non come dato pubblicabile. I testi tedeschi sono scritti in fase di ' +
  'sviluppo e vanno sottoposti a revisione madrelingua prima di qualsiasi rilascio.';

export const a1Pack = parseContentPack(mergeFragments(FRAGMENTS, 'A1', NOTES), 'content/a1');
