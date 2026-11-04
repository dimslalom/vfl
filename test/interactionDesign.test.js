import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRestAngle } from '../shared/src/lib/cardPhysics.js';

test('resting card jitter is deterministic and stays inside the authored range', () => {
  const first = Number(seededRestAngle('player-17'));
  assert.equal(first, Number(seededRestAngle('player-17')));
  assert.ok(Math.abs(first) >= 1.2 && Math.abs(first) <= 2);
  assert.notEqual(seededRestAngle('player-17'), seededRestAngle('player-18'));
});
