/**
 * Guscio HTML delle pagine esportate staticamente.
 *
 * Esiste solo sul web, e solo in fase di export: expo-router lo usa per
 * generare l'HTML di ogni rotta. Su iOS e Android non viene mai caricato.
 *
 * Serve a due cose che il bundler non può fare da sé: registrare il service
 * worker che rende il documento cross-origin isolated (senza, `expo-sqlite`
 * non ha la `SharedArrayBuffer` e il database non si apre), e dichiarare i
 * metadati che fanno diventare la pagina un'app quando la si aggiunge alla
 * schermata Home.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const BACKGROUND = '#0B0C0E';

// Con un `baseUrl` il sito non sta alla radice del dominio (su GitHub Pages
// sta sotto il nome del repository). Expo lo espone qui durante l'export.
const BASE = process.env.EXPO_BASE_URL ?? '';
const asset = (path: string) => `${BASE.replace(/\/$/, '')}/${path}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` serve al notch; senza `user-scalable=no` un
            doppio tocco sulla risposta zooma invece di selezionare. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />

        <link rel="manifest" href={asset('manifest.webmanifest')} />
        <meta name="theme-color" content={BACKGROUND} />

        {/* iOS ignora il manifest per l'aspetto della finestra: guarda ancora
            questi meta, che Apple non ha mai sostituito. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ANKER" />
        <link rel="apple-touch-icon" href={asset('icons/apple-touch-icon.png')} />

        {/* Prima che il bundle parta la pagina è vuota: senza questo lampeggia
            bianca, che su un'app a fondo scuro si vede parecchio. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `html,body{background-color:${BACKGROUND};margin:0;padding:0}
#root{display:flex;min-height:100%}`,
          }}
        />

        <ScrollViewStyleReset />

        {/* Va prima del bundle: al primo caricamento ricarica la pagina, e
            tanto vale che lo faccia prima che l'app tenti il database. */}
        <script src={asset('coi-serviceworker.js')} />
      </head>
      <body>{children}</body>
    </html>
  );
}
