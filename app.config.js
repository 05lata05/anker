/**
 * Su GitHub Pages il sito non sta alla radice del dominio ma sotto il nome del
 * repository (`https://tizio.github.io/anker/`). Expo deve saperlo in fase di
 * export, altrimenti genera riferimenti assoluti a `/` e la pagina carica un
 * bundle che non esiste.
 *
 * Il valore arriva dall'ambiente invece di stare fisso in `app.json` perché il
 * workflow lo ricava dal nome vero del repository: così rinominarlo non lascia
 * dietro un sito bianco e nessun indizio sul perché.
 */
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.ANKER_BASE_URL ?? config.experiments?.baseUrl ?? '',
  },
});
