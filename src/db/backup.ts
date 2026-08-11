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
  const picked = await File.pickFileAsync({ mimeTypes: ['application/octet-stream', 'application/x-sqlite3'] });
  if (picked.canceled) return { imported: false, backupUri: null };

  const target = databaseFile();
  let backupUri: string | null = null;

  if (target.exists) {
    const backup = new File(Paths.cache, `anker-prima-import-${timestamp()}.db`);
    if (backup.exists) backup.delete();
    target.copy(backup);
    backupUri = backup.uri;
    target.delete();
  }

  picked.result.copy(target);
  return { imported: true, backupUri };
}
