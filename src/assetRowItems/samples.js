import { outpostTemplate } from '../outpostModels.js';
import { makeRunner } from '../models.js';

// (a first few, to prove the row: the real catalogue replaces this)
const outpost = (kind, color, label, w, d) => ({ id: `outpost.${kind}`, label, w, d, make: () => outpostTemplate(kind, color, 0) });

export default {
  id: 'samples',
  title: '00 · SAMPLES',
  items: [
    outpost('mast', 0x2ec4ff, 'RELAY MAST', 56, 56),
    outpost('tower', 0xff4f2e, 'WATCHTOWER', 56, 56),
    { id: 'char.runner', label: 'RUNNER', w: 4, d: 4, make: () => ({ root: makeRunner({ own: true }).root }) },
  ],
};
