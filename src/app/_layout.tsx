import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../../drizzle/migrations';
import { getDatabase, resetDatabase } from '../db/client';
import { isSeeded, seedDatabase } from '../db/seed';
import { useSettingsStore } from '../state/settingsStore';
import { palette, spacing, type } from '../theme';

type Bootstrap = { status: 'pending' } | { status: 'ready' } | { status: 'error'; message: string };

/**
 * Segna un evento per la durata della scheda e dice se era già segnato.
 * `sessionStorage` può lanciare (Safari in navigazione privata): in quel caso
 * si risponde «già fatto», che è la risposta prudente — meglio mostrare
 * l'errore che rischiare un ciclo di ricariche.
 */
function gia(chiave: string): boolean {
  try {
    if (sessionStorage.getItem(chiave)) return true;
    sessionStorage.setItem(chiave, '1');
    return false;
  } catch {
    return true;
  }
}

/**
 * Rete di sicurezza per gli errori di render (§7: la sessione deve poter
 * riprendere senza perdere lo stato).
 *
 * Un crash a metà sessione senza questa schermata è uno schermo bianco: i dati
 * sono salvi — ogni risposta è già scritta nel database — ma l'utente non ha
 * modo di saperlo e presume di aver perso il lavoro.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const scheme = useColorScheme() ?? 'dark';
  const colors = palette[scheme === 'light' ? 'light' : 'dark'];

  return (
    <View style={[styles.center, { backgroundColor: colors.bg }]}>
      <Text style={[type.title, { color: colors.text, marginBottom: spacing.sm }]}>Qualcosa si è rotto</Text>
      <Text style={[type.body, { color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg }]}>
        Le risposte che hai già dato sono salvate: ogni richiamo viene scritto nel momento in cui rispondi, non alla
        fine della sessione.
      </Text>
      <Text style={[type.mono, { color: colors.textFaint, textAlign: 'center', marginBottom: spacing.lg }]}>
        {error.message}
      </Text>
      <Pressable accessibilityRole="button" onPress={() => void retry()}>
        <Text style={[type.label, { color: colors.text }]}>RIPROVA</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() ?? 'dark';
  const colors = palette[scheme === 'light' ? 'light' : 'dark'];
  const [bootstrap, setBootstrap] = useState<Bootstrap>({ status: 'pending' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        await migrate(db, migrations);
        if (!(await isSeeded(db))) {
          await seedDatabase(db);
        }
        await useSettingsStore.getState().load();
        if (!cancelled) setBootstrap({ status: 'ready' });
      } catch (e) {
        if (cancelled) return;
        // Un fallimento all'apertura sul web è spesso contesa sui file OPFS, e
        // passa con un worker nuovo. Si concede una ricarica sola — segnata in
        // sessionStorage — perché se il problema è stabile un ciclo infinito
        // sarebbe peggio dell'errore.
        if (Platform.OS === 'web' && !gia('anker-riavvio-db')) {
          window.location.reload();
          return;
        }
        setBootstrap({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (bootstrap.status === 'error') {
    // Un fallimento di migrazione o di seed non va nascosto dietro uno spinner
    // infinito: il database è l'unica copia dei dati dell'utente.
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text style={[type.title, { color: colors.danger, marginBottom: spacing.sm }]}>
          Impossibile preparare il database
        </Text>
        <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>{bootstrap.message}</Text>

        {Platform.OS === 'web' ? (
          // Sul web l'unico tentativo che può riuscire è ricaricare la pagina.
          // Il worker di expo-sqlite memorizza wa-sqlite prima di creare il
          // VFS: se la creazione fallisce, quel worker resta inservibile per
          // sempre e ogni nuovo tentativo dallo stesso documento muore su
          // «Invalid VFS state». Ricaricare è l'unico modo di averne uno nuovo.
          <Pressable
            accessibilityRole="button"
            onPress={() => window.location.reload()}
            style={{ marginTop: spacing.lg }}
          >
            <Text style={[type.label, { color: colors.text }]}>RICARICA LA PAGINA</Text>
          </Pressable>
        ) : null}

        {__DEV__ ? (
          // Solo in sviluppo: rigenerare lo schema lascia un file incompatibile
          // e senza questa via d'uscita si resta bloccati. Per un utente reale
          // sarebbe un pulsante che cancella anni di ripetizioni.
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBootstrap({ status: 'pending' });
              void resetDatabase().then(() => setReloadKey((key) => key + 1));
            }}
            style={{ marginTop: spacing.lg }}
          >
            <Text style={[type.label, { color: colors.textFaint }]}>
              SVILUPPO · CANCELLA IL DATABASE E RICOMINCIA
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (bootstrap.status !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
