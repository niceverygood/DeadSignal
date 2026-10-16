import test from 'node:test';
import assert from 'node:assert/strict';
import { BatchQueue, BatchPaused, parsePlan, normalizeJob } from '../src/batch.js';

const plan = jobs => parsePlan({ version: 1, jobs });
const job = (id, extra = {}) => ({ id, model: `${id}.glb`, ready: true, ...extra });
const result = id => ({ folder: `${id}-export`, directory: `/prototype/exports/${id}-export`, files: { atlas: 'atlas.png', bodyAlpha: 'body-alpha.png', metadata: 'metadata.json' }, urls: { atlas: `/exports/${id}-export/atlas.png` } });

test('queue uses exact selection/order; unready/missing/invalid jobs never become successes', async () => {
  const items = plan([job('one'), job('waiting', { ready: false }), job('missing'), job('bad', { frameSize: 3 }), job('two'), job('unselected')]);
  const calls = [], progress = [];
  const queue = new BatchQueue(items, {
    isAvailable: job => job.id !== 'missing',
    runJob: async (job, context) => { calls.push(job.id); context.report('real executor test boundary', .5); progress.push(queue.items.find(item => item.id === job.id).progress); return result(job.id); },
  });
  await queue.start(['one', 'waiting', 'missing', 'bad', 'two']);
  assert.deepEqual(calls, ['one', 'two']);
  assert.deepEqual(progress, [.5, .5]);
  assert.deepEqual(queue.summary(), { total: 6, completed: 2, failed: 1, skipped: 2, pending: 1, running: 0 });
  assert.equal(queue.items[3].job, undefined);
  assert.equal(queue.items[1].result, null);
  await queue.start(['one', 'two']);
  assert.deepEqual(calls, ['one', 'two'], 'completed jobs are not duplicated');
});

test('stop at render boundary leaves current job pending; resume keeps saved predecessors and original selection', async () => {
  const calls = [];
  let queue, paused = false;
  queue = new BatchQueue(plan([job('one'), job('two'), job('three'), job('unselected')]), {
    runJob: async (job, context) => {
      calls.push(job.id);
      if (job.id === 'two' && !paused) {
        paused = true; queue.stop();
        assert.equal(context.shouldStop(), true);
        throw new BatchPaused();
      }
      return result(job.id);
    },
  });
  await queue.start(['one', 'two', 'three']);
  assert.equal(queue.state, 'paused');
  assert.deepEqual(calls, ['one', 'two']);
  assert.equal(queue.items[0].status, 'complete'); assert.equal(queue.items[1].status, 'pending');
  await queue.resume();
  assert.deepEqual(calls, ['one', 'two', 'two', 'three']);
  assert.equal(queue.items[3].status, 'pending');
  assert.equal(queue.summary().completed, 3);
});

test('a save already in flight completes before stop, without duplicate export on resume', async () => {
  const calls = [];
  let queue;
  queue = new BatchQueue(plan([job('one'), job('two')]), {
    runJob: async (job) => {
      calls.push(job.id);
      if (job.id === 'one') queue.stop();
      return result(job.id);
    },
  });
  await queue.start();
  assert.equal(queue.state, 'paused'); assert.equal(queue.items[0].status, 'complete');
  await queue.resume();
  assert.deepEqual(calls, ['one', 'two']);
});

test('failure continues the queue; failed jobs retry only explicitly, and missing paths cannot count as complete', async () => {
  let retry = false;
  const calls = [];
  const queue = new BatchQueue(plan([job('bad'), job('good'), job('empty')]), {
    runJob: async job => {
      calls.push(job.id);
      if (job.id === 'bad' && !retry) throw new Error('actual renderer failed');
      if (job.id === 'empty') return {};
      return result(job.id);
    },
  });
  await queue.start();
  assert.deepEqual(queue.summary(), { total: 3, completed: 1, failed: 2, skipped: 0, pending: 0, running: 0 });
  await queue.start(); assert.deepEqual(calls, ['bad', 'good', 'empty']);
  retry = true;
  await queue.start(['bad'], { retryFailed: true });
  assert.deepEqual(calls, ['bad', 'good', 'empty', 'bad']);
  assert.equal(queue.summary().completed, 2);
});

test('resume checkpoint counts success only after local files are verified and exact job settings match', async () => {
  const original = new BatchQueue(plan([job('one'), job('two')]), { runJob: async job => result(job.id) });
  await original.start(['one']); original.state = 'paused';
  const checkpoint = original.checkpoint();
  const restored = new BatchQueue(plan([job('one'), job('two')]), { runJob: async job => result(job.id) });
  const checked = [];
  await restored.restore(checkpoint, async (result, job) => { checked.push(result.folder); return job.id === 'one'; });
  assert.deepEqual(checked, ['one-export']);
  assert.equal(restored.state, 'paused'); assert.equal(restored.summary().completed, 1);
  const absent = new BatchQueue(plan([job('one'), job('two')]), { runJob: async job => result(job.id) });
  await absent.restore(checkpoint, async () => false);
  assert.equal(absent.summary().completed, 0);
  const changed = new BatchQueue(plan([job('one', { subjectHeight: 120 }), job('two')]), { runJob: async job => result(job.id) });
  await changed.restore(checkpoint, async () => assert.fail('different configuration must not restore old result'));
  assert.equal(changed.summary().completed, 0);
});

test('plan rejects duplicate IDs/remote paths and validates native scale/pivot/core controls', () => {
  assert.throws(() => plan([job('same'), job('same')]));
  assert.throws(() => parsePlan({ version: 2, jobs: [] }));
  assert.throws(() => normalizeJob(job('remote', { model: 'https://example.com/a.glb' })));
  assert.throws(() => normalizeJob(job('escape', { model: '../a.glb' })));
  assert.throws(() => normalizeJob(job('bad-core', { coreRegion: [0, .5, 1, .1] })));
  assert.throws(() => normalizeJob(job('bad-scale', { uniformScale: Infinity })));
  const prop = normalizeJob(job('prop', { uniformScale: 40, originPivot: { x: .5, y: -.2, z: 0 }, coreRegion: [.05, .1, .95, .8] }));
  assert.equal(prop.uniformScale, 40); assert.deepEqual(prop.originPivot, { x: .5, y: -.2, z: 0 });
  assert.equal(normalizeJob(job('not-ready', { ready: 'yes' })).ready, false);
});
