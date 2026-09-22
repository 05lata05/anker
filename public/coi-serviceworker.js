/**
 * Isolamento cross-origin su un hosting che non manda le intestazioni.
 *
 * `expo-sqlite` sul web parla con il worker SQLite attraverso una
 * `SharedArrayBuffer`, e i browser la espongono solo a un documento
 * cross-origin isolated. Per esserlo servono due intestazioni di risposta:
 *
 *     Cross-Origin-Opener-Policy: same-origin
 *     Cross-Origin-Embedder-Policy: require-corp
 *
 * GitHub Pages serve file statici e non permette di configurarle. Un service
 * worker però si interpone fra la pagina e la rete: rifà la richiesta e
 * riscrive le intestazioni della risposta prima che il browser la veda. Il
 * documento risulta isolato anche se il server non ne sa nulla.
 *
 * Questo file fa due lavori diversi a seconda di dove viene eseguito: come
 * script di pagina registra il worker, come service worker intercetta le
 * richieste. Sta in un file solo perché un service worker può controllare solo
 * le pagine sotto il proprio percorso, e tenerlo alla radice del sito è il modo
 * più semplice di garantirlo.
 *
 * Tecnica nota come «coi-serviceworker» (Guido Zuidhof, MIT).
 */

if (typeof window === 'undefined') {
  // ---- contesto service worker ----

  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Si interviene SOLO sulla navigazione. È il documento a decidere se il
    // contesto è isolato: le sue sottorisorse sono tutte same-origin, e
    // `require-corp` non chiede nulla a quelle.
    //
    // Intercettare tutto invece funziona ma costa: ogni file farebbe un giro
    // in più dentro il worker, e `expo-sqlite` apre il database con
    // un'attesa sincrona che scade in qualche decina di millisecondi. Con il
    // salto in più la prima query arrivava fuori tempo massimo e l'app si
    // fermava su «Impossibile preparare il database» — in modo intermittente,
    // che è il modo peggiore.
    if (request.mode !== 'navigate') return;

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response; // risposta opaca

          const headers = new Headers(response.headers);
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        })
        .catch((error) => {
          console.error('[coi] navigazione fallita:', error);
          throw error;
        })
    );
  });
} else {
  // ---- contesto pagina ----

  (() => {
    if (window.crossOriginIsolated) return; // già isolati: niente da fare
    if (!window.isSecureContext) {
      console.error('[coi] servono HTTPS o localhost: il service worker non si registra.');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      console.error('[coi] questo browser non ha i service worker.');
      return;
    }

    // Al primo caricamento il worker non controlla ancora questo documento:
    // le intestazioni arrivano solo dalla navigazione successiva. Serve quindi
    // una ricarica, ma esattamente UNA, e solo qui.
    //
    // La ricarica non è innocua: il worker SQLite tiene aperti gli handle OPFS
    // del database, e su Safari il caricamento successivo li ritrova bloccati
    // e muore con «the operation failed for an unknown transient reason». Su
    // una pagina non isolata il database non è mai stato aperto — `getDatabase`
    // si astiene — quindi ricaricare è sicuro. Su una pagina già isolata non lo
    // sarebbe, ed è per questo che lì non si ricarica per nessun motivo, nemmeno
    // quando esce una versione nuova del worker: quella subentrerà da sé alla
    // prossima navigazione.
    const GIA_RICARICATO = 'coi-ricaricato';

    function ricaricaUnaVolta() {
      let fatto = null;
      try {
        fatto = sessionStorage.getItem(GIA_RICARICATO);
      } catch {
        // Safari in navigazione privata può lanciare: si procede senza.
      }
      if (fatto) {
        console.error('[coi] ricarica già tentata ma la pagina non è isolata: mi fermo.');
        return;
      }
      try {
        sessionStorage.setItem(GIA_RICARICATO, '1');
      } catch {
        /* vedi sopra */
      }
      window.location.reload();
    }

    // Il percorso va risolto rispetto a QUESTO script, non alla pagina: le
    // rotte annidate (`/anker/item/42`) risolverebbero un relativo nel posto
    // sbagliato, e uno scope che non copre la pagina non la controlla.
    const scriptUrl = document.currentScript
      ? document.currentScript.src
      : new URL('coi-serviceworker.js', location.href).href;
    const scope = scriptUrl.slice(0, scriptUrl.lastIndexOf('/') + 1);

    navigator.serviceWorker
      .register(scriptUrl, { scope })
      .then((registration) => {
        // Alla primissima registrazione il worker è in installazione e non c'è
        // ancora niente da cui la pagina possa trarre vantaggio: si aspetta che
        // diventi attivo. Dopo, `active` c'è già.
        const worker = registration.installing || registration.waiting || registration.active;
        if (!worker) return;
        if (worker.state === 'activated') {
          ricaricaUnaVolta();
          return;
        }
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') ricaricaUnaVolta();
        });
      })
      .catch((error) => console.error('[coi] registrazione fallita:', error));
  })();
}
