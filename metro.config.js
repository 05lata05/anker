const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle genera le migrazioni come .sql: vanno risolte come sorgenti
// (e trasformate in stringhe dal plugin babel `inline-import`).
config.resolver.sourceExts.push('sql');

// Su web expo-sqlite gira su wa-sqlite, che è un binario WASM.
config.resolver.assetExts.push('wasm');

// wa-sqlite usa SharedArrayBuffer, che il browser espone solo in un contesto
// cross-origin isolato. Senza queste intestazioni il dev server web esplode a
// runtime con un errore poco leggibile.
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(req, res, next);
};

module.exports = config;
