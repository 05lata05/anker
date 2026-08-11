import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../../drizzle/migrations';
import { getDatabase, resetDatabase } from '../db/client';
import { isSeeded, seedDatabase } from '../db/seed';
import { useSettingsStore } from '../state/settingsStore';
import { palette, spacing, type } from '../theme';

type Bootstrap = { status: 'pending' } | { status: 'ready' } | { status: 'error'; message: string };

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
        if (!cancelled) setBootstrap({ status: 'error', message: e instanceof Error ? e.message : String(e) });
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
