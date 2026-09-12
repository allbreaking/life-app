import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Node 25 exposes an unusable experimental localStorage without --localstorage-file.
// Keep component tests on the same synchronous Storage contract as browsers/jsdom.
if (typeof window.localStorage?.clear !== 'function') {
  const values = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage });
}

afterEach(cleanup);
