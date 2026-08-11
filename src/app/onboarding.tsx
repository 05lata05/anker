import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type PlacementAnswer,
  type PlacementQuestion,
  buildPlacement,
  scorePlacement,
  shouldStop,
} from '../core/onboarding/placement';
import type { Item } from '../core/types';
import { getDatabase } from '../db/client';
import { applyPlacement, loadEngineState } from '../db/repo';
import { Button, Chip, Label, Surface } from '../features/ui/components';
import { useColors } from '../features/ui/theme';
import { spacing, type } from '../theme';

type Phase = 'intro' | 'test' | 'result';

/**
 * Onboarding con placement adattivo (§7.1).
 *
 * Il tono della schermata è deliberatamente sobrio: promettere una misura del
 * livello che venti domande non possono dare significa che il primo item
 * sbagliato sembrerà un errore dell'app invece che il normale assestamento.
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const colors = useColors();

  const [phase, setPhase] = useState<Phase>('intro');
  const [items, setItems] = useState<Item[]>([]);
  const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PlacementAnswer[]>([]);
  const [seeded, setSeeded] = useState(0);

  useEffect(() => {
    (async () => {
      const db = await getDatabase();
      const state = await loadEngineState(db);
      const all = [...state.itemsById.values()];
      setItems(all);
      setQuestions(buildPlacement(all));
    })();
  }, []);

  const result = useMemo(() => scorePlacement(answers), [answers]);
  const question = questions[index];

  async function answer(optionIndex: number) {
    const next: PlacementAnswer[] = [
      ...answers,
      { itemId: question.item.id, correct: optionIndex === question.answerIndex, band: question.band },
    ];
    setAnswers(next);

    const finished = shouldStop(next) || index + 1 >= questions.length;
    if (!finished) {
      setIndex(index + 1);
      return;
    }

    const db = await getDatabase();
    const scored = scorePlacement(next);
    setSeeded(await applyPlacement(db, scored, Date.now()));
    setPhase('result');
  }

  async function skip() {
    const db = await getDatabase();
    await applyPlacement(db, { level: 'A1', knownItemIds: [] }, Date.now());
    router.replace('/');
  }

  if (phase === 'intro') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <Text style={[type.display, { color: colors.text }]}>ANKER</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>
            Ogni parola viene ancorata alla memoria a lungo termine. Le sessioni durano venti minuti e sono
            volutamente faticose: se una sessione sembra facile, non sta insegnando niente.
          </Text>

          <Surface>
            <Label>Prima di cominciare</Label>
            <Text style={[type.body, { color: colors.textMuted }]}>
              Poche domande a difficoltà crescente, per non farti ripartire da «Hallo» se sai già qualcosa. È una
              stima grossolana, non una misura del tuo livello: quello che sbaglia si corregge da sé nei primi
              giorni.
            </Text>
          </Surface>

          <View style={styles.spacer} />
          <Button label="Iniziamo" onPress={() => setPhase('test')} disabled={questions.length === 0} />
          <Button label="Salta, parto da zero" variant="ghost" onPress={skip} />
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'result') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <Label>Punto di partenza</Label>
          <Text style={[type.display, { color: colors.text }]}>{result.level}</Text>
          <Text style={[type.body, { color: colors.textMuted }]}>
            {answers.filter((a) => a.correct).length} risposte esatte su {answers.length}.
            {seeded > 0
              ? ` Ho dato per noti ${result.knownItemIds.length} item, con una scadenza ravvicinata: se la stima è sbagliata te ne accorgerai tra pochi giorni e rientreranno in circolo.`
              : ' Si parte dall’inizio.'}
          </Text>

          <View style={styles.spacer} />
          <Button label="Vai alla home" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  if (!question) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
        <View style={styles.content}>
          <Text style={[type.body, { color: colors.textMuted }]}>Nessun contenuto disponibile.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Label>
          Domanda {index + 1} di {questions.length}
        </Label>

        <Text style={[type.german, { color: colors.text }]}>{question.item.de}</Text>

        <View style={styles.options}>
          {question.options.map((option, optionIndex) => (
            <Chip key={option} label={option} onPress={() => void answer(optionIndex)} />
          ))}
        </View>

        <Text style={[type.body, { color: colors.textFaint }]}>
          Se non lo sai, tira a indovinare o scegli a caso: serve a capire dove fermarsi, non a fare punteggio.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, gap: spacing.md },
  options: { gap: spacing.sm },
  spacer: { flex: 1, minHeight: spacing.xl },
});
