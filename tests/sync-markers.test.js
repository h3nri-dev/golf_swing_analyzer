import test from 'node:test';
import assert from 'node:assert/strict';
import { firstSharedMoment } from '../deploy/keyframes.js';

const clip = (marks = {}, keyMoments = []) => ({ marks, keyMoments, video: { duration: 5 } });

test('first shared marker follows phase order, respects manual edits and accepts frame zero', () => {
  const a = clip({ impact: 2, address: 0 }, [{ key: 'address', time: .2, source: 'estimated' }]);
  const b = clip({ impact: 3 }, [{ key: 'address', time: .5, source: 'estimated' }]);
  const before = JSON.stringify([a, b]);
  assert.deepEqual(firstSharedMoment([a, b]), { key: 'address', label: 'Address', times: [0, .5] });
  assert.equal(JSON.stringify([a, b]), before);
});

test('missing earlier phases choose the next phase present in both videos', () => {
  assert.deepEqual(firstSharedMoment([clip({ address: .1, top: .6 }), clip({ top: 1.4, impact: 2 })]), {
    key: 'top', label: 'Top of backswing', times: [.6, 1.4],
  });
});

test('unrelated phases, empty entries and unconfirmed previews never form a sync pair', () => {
  assert.equal(firstSharedMoment([clip({ address: 0 }), clip({ impact: 1 })]), null);
  assert.equal(firstSharedMoment([clip({}, [{ key: 'address', time: 0, source: 'sampled' }]), clip({ address: 1 })]), null);
  assert.equal(firstSharedMoment([clip(), clip()]), null);
  assert.equal(firstSharedMoment([clip({ address: 0 })]), null);
});

test('invalid or out-of-video markers are skipped without discarding a later valid pair', () => {
  for (const time of [-1, 5, 6, NaN, Infinity]) {
    assert.equal(firstSharedMoment([clip({ address: time, impact: 2 }), clip({ address: 1, impact: 3 })]).key, 'impact');
  }
});
