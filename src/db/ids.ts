/**
 * Generatore di id per le righe locali.
 *
 * Non usa `expo-crypto` di proposito: questi id non escono mai dal dispositivo
 * e non hanno requisiti di imprevedibilità — servono solo a non collidere.
 * Tenere fuori la dipendenza nativa rende `repo.ts` eseguibile in Node, e
 * quindi il layer dati verificabile con un test di integrazione vero invece che
 * solo sul telefono.
 */
let counter = 0;

export function newId(): string {
  counter = (counter + 1) % 0xffffff;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
