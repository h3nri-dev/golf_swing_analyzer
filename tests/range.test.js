import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analysisRangeError } from '../deploy/range.js';

test('analysis accepts sections anywhere in a long video, up to 20 seconds', () => {
  assert.equal(analysisRangeError(31.2, 51.2, 120), '');
  assert.equal(analysisRangeError(0, 0.2, 0.2), '');
  assert.match(analysisRangeError(30, 50.01, 120), /20 seconds/);
});
test('analysis rejects missing, reversed, empty and out-of-bounds selections', () => {
  assert.match(analysisRangeError(NaN, 2, 4), /Enter/);
  assert.match(analysisRangeError(0, Infinity, 4), /Enter/);
  assert.match(analysisRangeError(3, 2, 4), /after start/);
  assert.match(analysisRangeError(1, 1, 4), /after start/);
  assert.match(analysisRangeError(-1, 2, 4), /within/);
  assert.match(analysisRangeError(0, 4.001, 4), /within/);
});
test('millisecond-rounded duration is allowed without extending the scan', () => {
  assert.equal(analysisRangeError(0, 4.005, 4.0047), '');
  assert.match(analysisRangeError(0, 4.006, 4.0047), /within/);
  assert.match(analysisRangeError(4.0048, 4.005, 4.0047), /within/);
});
