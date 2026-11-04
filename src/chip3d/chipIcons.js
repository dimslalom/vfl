// Line icons on a 24 unit grid, as SVG path data so the same shapes draw on a
// canvas (the 3D chip face) and inline in the page (the open chip's payout).

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;

export const ICON_PATHS = {
  Duelist: ['M4 20L18 6M13 4h7v7M4 14l6 6M3 21l3-3'],
  Initiator: [circle(6, 18, 2.2), 'M6 11a7 7 0 0 1 7 7M6 4.5A13.5 13.5 0 0 1 19.5 18'],
  Controller: [circle(12, 12, 8.5), circle(12, 12, 3.5)],
  Sentinel: ['M12 2.5l8 3v6.2c0 5-3.4 8.4-8 9.8-4.6-1.4-8-4.8-8-9.8V5.5z', 'M12 7v9'],
  flick: [circle(9, 15, 5.5), 'M9 12v6M6 15h6M14 10l6-6M15 4h5v5'],
  flex: ['M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4'],
  mastermind: ['M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4'],
  igl: ['M3 19h18M4 16l-1-9 5 4 4-7 4 7 5-4-1 9z'],
  map: ['M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4M5 11h14v10H5z'],
};

export const ICON_LABELS = {
  Duelist: 'Duelist', Initiator: 'Initiator', Controller: 'Controller', Sentinel: 'Sentinel',
  flick: 'Flick', flex: 'Flex', mastermind: 'Mastermind', igl: 'IGL', map: 'Map rule', lock: 'Map rule',
};
