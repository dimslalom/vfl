import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollLeanTarget, stepScrollLean } from '../src/lib/scrollPhysics.js';

function simulate(hz, seconds = 1) {
  let state = { angle: 0, velocity: 0, target: 6 };
  for (let i = 0; i < hz * seconds; i += 1) state = stepScrollLean(state, state.target, 1 / hz);
  return state;
}

test('scroll lean settles equally at 30, 60 and 120 Hz', () => {
  const reference = simulate(60);
  for (const hz of [30, 120]) {
    const result = simulate(hz);
    assert.ok(Math.abs(result.angle - reference.angle) < 0.005);
    assert.ok(Math.abs(result.target - reference.target) < 0.0001);
    assert.ok(Math.abs(result.velocity - reference.velocity) < 0.01);
  }
  assert.ok(Math.abs(reference.angle) < 0.05);
});

test('same scroll velocity produces the same lean across event rates', () => {
  assert.equal(scrollLeanTarget(4, 16), scrollLeanTarget(2, 8));
  assert.equal(scrollLeanTarget(-4, 16), -scrollLeanTarget(4, 16));
  assert.equal(scrollLeanTarget(0, 16), 0);
});

test('large gestures and delayed frames remain bounded and settle', () => {
  assert.equal(scrollLeanTarget(1000, 0), 6);
  assert.equal(scrollLeanTarget(-1000, 0), -6);
  let state = stepScrollLean({ angle: 0, velocity: 0 }, 6, 0.5);
  assert.ok(Number.isFinite(state.angle));
  for (let i = 0; i < 100; i += 1) state = stepScrollLean(state, state.target, 0.05);
  assert.ok(Math.abs(state.angle) < 0.001);
  assert.ok(Math.abs(state.velocity) < 0.001);
});
