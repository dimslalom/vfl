import test from 'node:test';
import assert from 'node:assert/strict';
import { flightPose } from '../src/lib/flightPath.js';

const path = { x: 600, y: 420, arc: -60, scaleTo: 0.3, rotate: -8 };

test('reward flight starts at its source and lands at its target and scale', () => {
  for (const [t, expected] of [
    [0, { x: 0, y: 0, scale: 1, rotate: 0 }],
    [1, { x: 600, y: 420, scale: 0.3, rotate: -8 }],
  ]) {
    const pose = flightPose(t, path);
    for (const key of Object.keys(expected)) assert.ok(Math.abs(pose[key] - expected[key]) < 1e-10);
  }
});

test('the arc rises above a straight flight without braking or turning at its midpoint', () => {
  const before = flightPose(0.49, path);
  const middle = flightPose(0.5, path);
  const after = flightPose(0.51, path);
  assert.equal(middle.y, path.y / 2 + path.arc);
  assert.ok(before.x < middle.x && middle.x < after.x);
  const incoming = { x: middle.x - before.x, y: middle.y - before.y };
  const outgoing = { x: after.x - middle.x, y: after.y - middle.y };
  assert.ok(Math.abs(incoming.x - outgoing.x) < 0.001);
  assert.ok(Math.abs(incoming.y - outgoing.y) < 0.1);
  assert.ok(Math.hypot(incoming.x, incoming.y) > 5);
});

test('upward and vertical targets remain continuous and finish exactly', () => {
  const vertical = { ...path, x: 0, y: -200 };
  assert.equal(flightPose(1, vertical).x, 0);
  assert.equal(flightPose(1, vertical).y, -200);
  const flat = { ...path, arc: 0 };
  assert.equal(flightPose(0.5, flat).y, 210);
});
