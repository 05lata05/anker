import type { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Torna indietro, o alla home se non c'è un indietro.
 *
 * `router.back()` da solo non basta: quando la schermata è stata aperta senza
 * cronologia — da una notifica, da un link, o ricaricando l'app su una rotta
 * interna — la navigazione non fa nulla e l'utente resta su uno schermo che non
 * risponde. È il caso di chi tocca il promemoria del ripasso lampo, cioè
 * esattamente il percorso che l'app suggerisce di usare.
 */
export function goBackOrHome(router: Router): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace('/');
}
