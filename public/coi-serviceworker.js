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
    // le intestazioni arrivano solo dalla navigazione successiva. Per questo
    // si ricarica una volta sola, e la si segna in `sessionStorage` per non
    // entrare in un ciclo se per qualche motivo l'isolamento non arriva.
    const ALREADY_RELOADED = 'coi-reloaded';

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
        registration.addEventListener('updatefound', () => window.location.reload());
        if (registration.active && !navigator.serviceWorker.controller) {
          window.location.reload();
          return;
        }
        if (navigator.serviceWorker.controller) {
          let reloaded = null;
          try {
            reloaded = sessionStorage.getItem(ALREADY_RELOADED);
          } catch {
            // Safari in navigazione privata può lanciare: si procede senza.
          }
          if (!reloaded) {
            try {
              sessionStorage.setItem(ALREADY_RELOADED, '1');
            } catch {
              /* vedi sopra */
            }
            window.location.reload();
          }
        }
      })
      .catch((error) => console.error('[coi] registrazione fallita:', error));
  })();
}
