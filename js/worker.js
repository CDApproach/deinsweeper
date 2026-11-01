// Erzeugt Spielfelder im Hintergrund, damit die Oberfläche flüssig bleibt.
import { generate } from './core.js';

self.onmessage = (e) => {
  const { id, mode, diff, first, seed } = e.data;
  const board = generate(mode, diff, first, seed);
  self.postMessage({ id, board });
};
