// Every kind of card pack, as data. The model is shared (public/assets/pack3d/pack.glb);
// a pack type only says what to print on it and how its foil behaves.
//
// Adding an event pack later is one entry here: give it an id, words, a palette and
// foil settings. Each pack's cover art is picked from a seed (packCover.js).
// See docs/pack-pipeline.md.

export const PACK_TYPES = {
  silver: {
    id: 'silver',
    title: 'Silver',
    subtitle: 'Player pack',
    rule: 'Bronze, silver and gold players',
    code: 'SLV',
    // Which cards may be dealt from it, for the engine to read later.
    contains: 'any',
    // How the front is laid out: a halftone 'poster' or 'fullbleed' art to every edge.
    front: 'poster',
    palette: { base: '#c9ccd3', deep: '#8e939d', ink: '#14161d', accent: '#ff4655', seal: '#aeb2ba', cover: '#2b3145' },
    foil: { roughness: 0.26, clearcoat: 0.3, iridescence: 0.12 },
    effects: { holo: 0, glitter: 0 },
  },
  gold: {
    id: 'gold',
    title: 'Gold',
    subtitle: 'Gold pack',
    rule: 'Gold players only',
    code: 'GLD',
    contains: 'gold',
    front: 'poster',
    palette: { base: '#dcb65c', deep: '#9c7726', ink: '#241b05', accent: '#ff4655', seal: '#c39a3f', cover: '#5e420c' },
    foil: { roughness: 0.22, clearcoat: 0.35, iridescence: 0.08 },
    effects: { holo: 0, glitter: 0.35 },
  },
  icons: {
    id: 'icons',
    title: 'Icons',
    subtitle: 'Icons pack',
    rule: 'Icons only',
    code: 'ICN',
    contains: 'icon',
    front: 'fullbleed',
    palette: { base: '#3a2a6a', deep: '#120b26', ink: '#f2eeff', accent: '#ffd166', seal: '#1d1438', cover: '#3b2486' },
    foil: { roughness: 0.18, clearcoat: 0.45, iridescence: 1 },
    // Icons get the special treatment: a holographic film and glitter that flash as the pack turns.
    effects: { holo: 1, glitter: 0.5 },
  },
};

export const PACK_TYPE_LIST = Object.values(PACK_TYPES);
