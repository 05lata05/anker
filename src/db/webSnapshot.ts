/**
 * Copia del database in IndexedDB, per il web quando OPFS non è utilizzabile.
 *
 * Il percorso normale sul web tiene il database su OPFS, dove SQLite scrive
 * pagina per pagina come su un file vero. Quando OPFS non c'è o si rifiuta —
 * succede su WebKit — l'alternativa è tenere il database in memoria e salvarne
 * ogni tanto l'immagine completa qui dentro.
 *
 * È un ripiego, non un pari grado: si riscrive l'intero file a ogni
 * salvataggio invece delle sole pagine toccate, e fra una scrittura e l'altra
 * c'è una finestra in cui l'ultima risposta non è ancora al sicuro. In cambio
 * l'app funziona su un browser dove altrimenti non partirebbe affatto.
 *
 * IndexedDB e non localStorage perché il database è binario e supera
 * abbondantemente i cinque megabyte a cui localStorage è limitato.
 */
const NOME_DB = 'anker-snapshot';
const NOME_STORE = 'file';
const CHIAVE = 'anker.db';

function apri(): Promise<IDBDatabase> {
  return new Promise((risolvi, rifiuta) => {
    const richiesta = indexedDB.open(NOME_DB, 1);
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result;
      if (!db.objectStoreNames.contains(NOME_STORE)) db.createObjectStore(NOME_STORE);
    };
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
    // Se un'altra scheda tiene aperta una versione precedente l'apertura resta
    // sospesa senza errore: meglio fallire che restare appesi per sempre.
    richiesta.onblocked = () => rifiuta(new Error('IndexedDB bloccato da un altra scheda'));
  });
}

function transazione<T>(
  modo: IDBTransactionMode,
  azione: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return apri().then(
    (db) =>
      new Promise<T>((risolvi, rifiuta) => {
        const tx = db.transaction(NOME_STORE, modo);
        const richiesta = azione(tx.objectStore(NOME_STORE));
        richiesta.onsuccess = () => risolvi(richiesta.result);
        richiesta.onerror = () => rifiuta(richiesta.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => {
          db.close();
          rifiuta(tx.error);
        };
      })
  );
}

export async function leggiSnapshot(): Promise<Uint8Array | null> {
  try {
    const dati = await transazione<ArrayBuffer | undefined>('readonly', (store) => store.get(CHIAVE));
    return dati ? new Uint8Array(dati) : null;
  } catch {
    // Una copia illeggibile equivale a non averla: si riparte da zero, che è
    // meglio che non far partire l'app.
    return null;
  }
}

export async function scriviSnapshot(byte: Uint8Array): Promise<void> {
  // Si copia in un ArrayBuffer proprio: la vista arriva dal worker SQLite e
  // structuredClone di una vista su memoria condivisa non è garantito.
  const copia = new Uint8Array(byte).buffer;
  await transazione('readwrite', (store) => store.put(copia, CHIAVE));
}

export async function cancellaSnapshot(): Promise<void> {
  try {
    await transazione('readwrite', (store) => store.delete(CHIAVE));
  } catch {
    /* niente da cancellare */
  }
}
