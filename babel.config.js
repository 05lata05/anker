module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Le migrazioni Drizzle sono file .sql importati come stringhe:
      // senza questo plugin il bundler non sa cosa farsene.
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};
