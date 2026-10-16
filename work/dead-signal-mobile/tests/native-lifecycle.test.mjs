import test from 'node:test';
import assert from 'node:assert/strict';
import { bindNativeLifecycle, mountNativeGameBridge } from '../native/native-lifecycle.mjs';

function fixture() {
  const listeners = new Map(), removed = [], calls = [];
  const plugin = {
    async addListener(name, callback) { listeners.set(name, callback); return { remove: async () => { removed.push(name); } }; },
    async minimizeApp() { calls.push('minimize'); }
  };
  return { plugin, listeners, removed, calls };
}
test('native background is synchronous and deduplicated; foreground does not request a game resume', async () => {
  const f = fixture(), calls = [];
  const bridge = bindNativeLifecycle(f.plugin, { onInactive: () => calls.push('checkpoint-pause-audio'), onActive: () => calls.push('foreground') });
  await bridge.ready;
  f.listeners.get('appStateChange')({ isActive: false });
  assert.deepEqual(calls, ['checkpoint-pause-audio']);
  f.listeners.get('appStateChange')({ isActive: false });
  f.listeners.get('appStateChange')({ isActive: 'true' });
  assert.equal(calls.length, 1);
  f.listeners.get('appStateChange')({ isActive: true });
  assert.deepEqual(calls, ['checkpoint-pause-audio', 'foreground']);
  await bridge.dispose();
});
test('Android back does not minimize when operation or dialog handled it; title back minimizes once', async () => {
  const f = fixture(); let handled = true;
  const bridge = bindNativeLifecycle(f.plugin, { onBack: () => handled }); await bridge.ready;
  f.listeners.get('backButton')({}); assert.deepEqual(f.calls, []);
  handled = false; f.listeners.get('backButton')({}); assert.deepEqual(f.calls, ['minimize']);
  await bridge.dispose();
});
test('dispose removes only this bridge listeners, and callbacks after disposal cannot save or minimize', async () => {
  const f = fixture(); let calls = 0;
  const bridge = bindNativeLifecycle(f.plugin, { onInactive: () => calls++ }); await bridge.ready;
  await bridge.dispose(); await bridge.dispose();
  f.listeners.get('appStateChange')({ isActive: false }); f.listeners.get('backButton')({});
  assert.equal(calls, 0); assert.deepEqual(f.calls, []); assert.deepEqual(f.removed.sort(), ['appStateChange', 'backButton']);
});
test('a listener handle that arrives after dispose is removed rather than leaked', async () => {
  const resolves = [], removed = [];
  const plugin = { addListener: name => new Promise(resolve => resolves.push(() => resolve({ remove: async () => removed.push(name) }))) };
  const bridge = bindNativeLifecycle(plugin); const disposing = bridge.dispose();
  resolves.forEach(resolve => resolve()); await disposing;
  assert.deepEqual(removed.sort(), ['appStateChange', 'backButton']);
});
test('registration and minimize failures are reported without an unhandled rejection', async () => {
  const errors = [], callbacks = {};
  const plugin = { addListener(name, callback) { if (name === 'appStateChange') throw new Error('registration'); callbacks[name] = callback; return { remove() {} }; }, minimizeApp: () => Promise.reject(new Error('minimize')) };
  const bridge = bindNativeLifecycle(plugin, { onError: error => errors.push(error.message) }); await bridge.ready;
  callbacks.backButton({}); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, ['registration', 'minimize']); await bridge.dispose();
});
test('DOM bridge cancellation maps to handled back without Game globals', async () => {
  const f = fixture(), target = new EventTarget(), states = [];
  class DetailEvent extends Event { constructor(type, options) { super(type, options); this.detail = options?.detail; } }
  target.CustomEvent = DetailEvent;
  target.addEventListener('dead-signal:app-state', event => states.push(event.detail.isActive));
  target.addEventListener('dead-signal:back', event => event.preventDefault());
  const bridge = mountNativeGameBridge(f.plugin, target); await bridge.ready;
  f.listeners.get('appStateChange')({ isActive: false }); f.listeners.get('appStateChange')({ isActive: true }); f.listeners.get('backButton')({});
  assert.deepEqual(states, [false, true]); assert.deepEqual(f.calls, []); await bridge.dispose();
});
