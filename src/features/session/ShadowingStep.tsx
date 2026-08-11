import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  SHADOWING_RATES,
  type TimingComparison,
  buildEnvelope,
  compareTiming,
  speechSpan,
} from '../../core/audio/envelope';
import type { Item } from '../../core/types';
import { spacing, type } from '../../theme';
import { speakGermanTimed } from '../audio/tts';
import { useShadowingRecorder } from '../audio/useShadowingRecorder';
import { Button, GermanText, Label, Surface } from '../ui/components';
import { useColors } from '../ui/theme';

const ENVELOPE_BUCKETS = 48;
const ENVELOPE_HEIGHT = 56;

/**
 * Shadowing (§4, Fase 4).
 *
 * Due passaggi — 0,8× poi 1× — poi si registra e si confronta in A/B.
 *
 * Cosa il confronto misura davvero: durata, ritmo in sillabe al secondo e
 * pause. Non il contorno prosodico punto per punto, che richiederebbe
 * registrazioni di parlanti reali: il riferimento qui è sintesi vocale, esce
 * dall'altoparlante e non passa da un buffer leggibile. La schermata lo dice
 * invece di mostrare due tracciati affiancati facendo credere che siano
 * confrontabili.
 *
 * Il giudizio finale è un'auto-valutazione binaria, che è la degradazione
 * elegante prevista quando non c'è riconoscimento vocale offline. Viene
 * registrata come tale: `selfAssessed` non produce mai `Easy`.
 */
export function ShadowingStep({
  item,
  ttsSpeed,
  onDone,
}: {
  item: Item;
  ttsSpeed: number;
  onDone: (assessment: 'good' | 'again' | 'skipped') => void;
}) {
  const colors = useColors();
  const recorder = useShadowingRecorder();

  const [pass, setPass] = useState(0);
  const [referenceMs, setReferenceMs] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [ttsBroken, setTtsBroken] = useState(false);
  const [timing, setTiming] = useState<TimingComparison | null>(null);

  async function playReference(rate: number) {
    setSpeaking(true);
    // Il passaggio si considera fatto appena parte, non quando finisce: se la
    // sintesi non risponde, l'utente non deve restare bloccato dietro un
    // pulsante disabilitato.
    setPass((current) => Math.max(current, SHADOWING_RATES.indexOf(rate) + 1));

    const { elapsedMs, completed } = await speakGermanTimed(item.de, { rate: rate * ttsSpeed });
    setSpeaking(false);
    setTtsBroken(!completed);

    // La durata a velocità piena è il riferimento: confrontare il proprio
    // parlato con il passaggio rallentato direbbe a tutti che vanno veloci.
    // E si registra solo se la sintesi ha davvero finito: un riferimento
    // stimato produrrebbe un confronto che sembra una misura e non lo è.
    if (rate === 1 && completed) setReferenceMs(elapsedMs);
  }

  async function stopRecording() {
    await recorder.stop();
  }

  function analyse() {
    if (!recorder.recording) return;
    const envelope = buildEnvelope(recorder.recording.samples, ENVELOPE_BUCKETS);
    const span = speechSpan(envelope, recorder.recording.durationMs);
    setTiming(
      compareTiming({
        text: item.de,
        referenceMs,
        userSpeechMs: span.durationMs,
        pauses: span.pauses,
      }),
    );
  }

  const envelope = recorder.recording ? buildEnvelope(recorder.recording.samples, ENVELOPE_BUCKETS) : [];

  return (
    <View style={styles.root}>
      <Label>Shadowing — ripeti sopra la voce, senza fermarti</Label>

      <Pressable onPress={() => void playReference(1)}>
        <GermanText text={item.de} gender={item.gender} />
      </Pressable>
      <Text style={[type.body, { color: colors.textMuted }]}>{item.it}</Text>

      <View style={styles.actions}>
        {SHADOWING_RATES.map((rate, i) => (
          <Button
            key={rate}
            label={`${rate}×${pass > i ? ' ✓' : ''}`}
            variant="ghost"
            onPress={() => void playReference(rate)}
            disabled={speaking || recorder.state === 'recording'}
          />
        ))}
      </View>

      {recorder.state === 'denied' ? (
        <Surface>
          <Text style={[type.body, { color: colors.textMuted }]}>
            Senza accesso al microfono non posso registrare. Puoi comunque ripetere ad alta voce e valutarti da solo.
          </Text>
        </Surface>
      ) : null}

      {recorder.state === 'recording' ? (
        <Button label="Ferma la registrazione" onPress={() => void stopRecording()} />
      ) : (
        <Button
          label={recorder.recording ? 'Registra di nuovo' : 'Registra'}
          onPress={() => void recorder.start()}
          disabled={speaking || pass === 0}
        />
      )}

      {pass === 0 ? (
        <Text style={[type.mono, { color: colors.textFaint }]}>
          Ascolta almeno una volta prima di registrare.
        </Text>
      ) : null}

      {ttsBroken ? (
        <Text style={[type.mono, { color: colors.textFaint }]}>
          Su questo dispositivo non c’è una voce tedesca funzionante: puoi registrarti lo stesso, ma senza modello da
          seguire e senza confronto del ritmo. Si installa dalle impostazioni di sistema, nella sezione sintesi
          vocale.
        </Text>
      ) : null}

      {recorder.recording ? (
        <Surface>
          <Label>Confronto</Label>

          {envelope.length > 1 ? (
            <>
              <View style={[styles.envelope, { height: ENVELOPE_HEIGHT }]}>
                {envelope.map((level, i) => (
                  <View
                    key={i}
                    style={[
                      styles.bar,
                      { height: Math.max(1, level * ENVELOPE_HEIGHT), backgroundColor: colors.text },
                    ]}
                  />
                ))}
              </View>
              <Text style={[type.mono, { color: colors.textFaint }]}>
                La tua voce nel tempo. Del riferimento non esiste una traccia da affiancare: è sintesi vocale, non
                una registrazione, quindi il confronto qui è di durata e ritmo, non di intonazione.
              </Text>
            </>
          ) : (
            <Text style={[type.mono, { color: colors.textFaint }]}>
              Questa piattaforma non espone il livello del microfono: niente traccia, resta il confronto A/B.
            </Text>
          )}

          <View style={styles.actions}>
            <Button label="Riferimento" variant="ghost" onPress={() => void playReference(1)} disabled={speaking} />
            <Button label="La mia voce" variant="ghost" onPress={recorder.playBack} />
          </View>

          <Button label="Confronta il ritmo" variant="ghost" onPress={analyse} disabled={referenceMs === 0} />

          {timing ? (
            <Text style={[type.body, { color: timing.verdict === 'aligned' ? colors.success : colors.textMuted }]}>
              {timing.message}
            </Text>
          ) : null}
        </Surface>
      ) : null}

      {recorder.error ? <Text style={[type.mono, { color: colors.danger }]}>{recorder.error}</Text> : null}

      <Surface>
        <Label>Come è andata?</Label>
        <Text style={[type.mono, { color: colors.textFaint }]}>
          Non c’è riconoscimento vocale offline, quindi il giudizio è tuo. Conta meno di una risposta scritta e non
          può mai valere «immediata»: serve a non lasciare la fase senza traccia, non a misurarti.
        </Text>
        <View style={styles.actions}>
          <Button label="Ci sono riuscito" onPress={() => onDone('good')} />
          <Button label="Non ancora" variant="ghost" onPress={() => onDone('again')} />
        </View>
        <Button label="Salta" variant="ghost" onPress={() => onDone('skipped')} />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  envelope: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { flex: 1, borderRadius: 1 },
});
