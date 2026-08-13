/**
 * Export e import del database (§7.6).
 *
 * L'MVP non ha backend né sincronizzazione: tutto vive sul dispositivo. Questo
 * rende l'export l'unico modo che l'utente ha di non perdere anni di
 * ripetizioni cambiando telefono, e quindi non è una funzione accessoria.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { DATABASE_NAME } from './client';

function databaseFile(): File {
  return new File(new Directory(Paths.document, 'SQLite'), DATABASE_NAME);
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export interface ExportResult {
  uri: string;
  sizeBytes: number;
  shared: boolean;
}

export async function exportDatabase(): Promise<ExportResult> {
  const source = databaseFile();
  if (!source.exists) throw new Error('Non trovo il file del database.');

  const destination = new File(Paths.cache, `anker-${timestamp()}.db`);
  if (destination.exists) destination.delete();
  source.copy(destination);

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(destination.uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Esporta il database di ANKER',
    });
  }

  return { uri: destination.uri, sizeBytes: destination.size ?? 0, shared: canShare };
}

export interface ImportResult {
  imported: boolean;
  /** Percorso della copia di sicurezza del database precedente. */
  backupUri: string | null;
}

/**
 * Sostituisce il database con un file scelto dall'utente.
 *
 * Prima di sovrascrivere fa una copia di quello esistente: importare un backup
 * sbagliato non deve poter cancellare il lavoro di mesi in modo irreversibile.
 * Dopo l'import l'app va riavviata, perché la connessione aperta punta ancora
 * ai vecchi dati — la funzione lo dichiara nel valore di ritorno invece di
 * fingere che l'operazione sia trasparente.
 */
export async function importDatabase(): Promise<ImportResult> {
  // Il selettore segnala l'annullamento lanciando, non con un valore: se
  // l'utente chiude il pannello non è un errore, è un «no».
  let picked: Awaited<ReturnType<typeof File.pickFileAsync>>;
  try {
    picked = await File.pickFileAsync(undefined, 'application/octet-stream');
  } catch {
    return { imported: false, backupUri: null };
  }

  // Il selettore è tipizzato sulla classe base: il `File` concreto arriva a
  // runtime, ma TypeScript vede la forma minima.
  const source = (Array.isArray(picked) ? picked[0] : picked) as File | undefined;
  if (!source) return { imported: false, backupUri: null };

  const target = databaseFile();
  let backupUri: string | null = null;

  if (target.exists) {
    const backup = new File(Paths.cache, `anker-prima-import-${timestamp()}.db`);
    if (backup.exists) backup.delete();
    target.copy(backup);
    backupUri = backup.uri;
    target.delete();
  }

  source.copy(target);
  return { imported: true, backupUri };
}
