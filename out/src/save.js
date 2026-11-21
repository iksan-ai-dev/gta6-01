// game/src/save.js
// Save system — persists game state to localStorage under a versioned key.

const SAVE_KEY = 'sunset-harbor-save';
const CURRENT_VERSION = 2;

export class Save {
  constructor() {}

  save(state) {
    const doc = { version: CURRENT_VERSION, savedAt: Date.now(), ...state };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(doc));
      return true;
    } catch (err) {
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw == null) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
      if (data.version !== 1 && data.version !== 2) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      // Storage unavailable — nothing to clear.
    }
  }

  hasSave() {
    return this.load() !== null;
  }

  export(state) {
    return JSON.stringify(state, null, 2);
  }

  import(data) {
    try {
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }
}
