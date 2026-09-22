import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFileFrameRate } from '../deploy/file-fps.js';

const metadata = (...tracks) => ({ media: { track: tracks } });
const video = fields => ({ '@type': 'Video', ...fields });

test('file rate comes from the video stream, never audio, capture or nominal rates', () => {
  assert.deepEqual(extractFileFrameRate(metadata(
    { '@type': 'General', FrameRate: 120 }, { '@type': 'Audio', FrameRate: 46.875 },
    video({ FrameRate: '29.970', FrameRate_Original: 120, FrameRate_Nominal: 30, FrameRate_Mode: 'CFR' }),
  )), { fps: 29.97, variable: false, average: false });
  assert.equal(extractFileFrameRate(metadata(video({ FrameRate_Original: 240, FrameRate_Nominal: 60 }))), null);
});

test('default video track takes precedence over other video tracks', () => {
  assert.equal(extractFileFrameRate(metadata(video({ FrameRate: 15 }), video({ Default: 'Yes', FrameRate: 59.94 }))).fps, 59.94);
  assert.equal(extractFileFrameRate(metadata(video({ Default: 'Yes' }), video({ FrameRate: 60 }))), null);
});

test('variable and count-derived rates are labeled as averages', () => {
  assert.deepEqual(extractFileFrameRate(metadata(video({ FrameRate: 44.981, FrameRate_Mode: 'VFR' }))), { fps: 44.981, variable: true, average: true });
  assert.deepEqual(extractFileFrameRate(metadata(video({ FrameCount: '48', Duration: '2' }))), { fps: 24, variable: false, average: true });
});

test('missing or invalid metadata never silently claims the default 30 FPS', () => {
  for (const result of [null, {}, metadata(), metadata({ '@type': 'Audio', FrameRate: 30 })]) assert.equal(extractFileFrameRate(result), null);
  for (const rate of [undefined, null, 0, -30, Infinity, 'unknown', '30 fps', 999999]) assert.equal(extractFileFrameRate(metadata(video({ FrameRate: rate }))), null);
  assert.equal(extractFileFrameRate(metadata(video({ FrameCount: 30, Duration: 0 }))), null);
});
