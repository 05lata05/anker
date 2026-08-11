/**
 * Impostazioni in memoria.
 *
 * Esiste perché alcune preferenze — il color-coding del genere su tutte —
 * servono a componenti sparsi in tutta l'app, e farle rileggere dal database a
 * ogni render di una parola tedesca non ha senso. Il database resta la fonte di
 * verità: qui c'è una copia, riallineata a ogni scrittura.
 */
import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from '../core/types';
import { getDatabase } from '../db/client';
import { getSettings, updateSettings } from '../db/repo';

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  patch: (update: Partial<Settings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loaded: false,

  async load() {
    const db = await getDatabase();
    set({ settings: await getSettings(db), loaded: true });
  },

  async patch(update) {
    // Prima lo stato locale, poi il database: la UI non deve aspettare la
    // scrittura per rispondere al tocco.
    set({ settings: { ...get().settings, ...update } });
    const db = await getDatabase();
    await updateSettings(db, update);
  },
}));

export function useGenderColorsEnabled(): boolean {
  return useSettingsStore((state) => state.settings.genderColorsEnabled);
}
