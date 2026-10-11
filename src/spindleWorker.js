import { buildRockArrays } from './spindleTerrain.js';

// Makes the Spindle's rock off the main thread (spindle.js prefetch): ~2 s of maths and normals that
// used to freeze the game the moment the mission began.
self.onmessage = () => {
  const d = buildRockArrays();
  self.postMessage(d, [d.pos.buffer, d.col.buffer, d.idx.buffer, d.nor.buffer]);
};
