// Bridge only. Game state is handled by the mobile app copy, never by this module.
export function bindNativeLifecycle(app, { onActive, onInactive, onBack, onError = () => {} } = {}) {
  if (!app || typeof app.addListener !== 'function') throw new TypeError('Capacitor App plugin is required');
  let disposed = false, active = true;
  const handles = new Set();
  const report = error => { try { onError(error); } catch {} };
  const registrations = [];
  const register = (name, callback) => {
    try {
      const pending = Promise.resolve(app.addListener(name, (...args) => {
        if (!disposed) callback(...args);
      })).then(async handle => {
        if (!handle || typeof handle.remove !== 'function') throw new TypeError('Invalid native listener handle');
        if (disposed) await handle.remove();
        else handles.add(handle);
      }).catch(report);
      registrations.push(pending);
    } catch (error) { report(error); }
  };
  register('appStateChange', state => {
    if (typeof state?.isActive !== 'boolean' || active === state.isActive) return;
    active = state.isActive;
    try { (active ? onActive : onInactive)?.(); } catch (error) { report(error); }
  });
  register('backButton', () => {
    try {
      // A handled back press pauses or closes a game dialog. Only the title screen
      // may minimize Android; this never exits or abandons an active operation.
      if (onBack?.() !== true && typeof app.minimizeApp === 'function') {
        Promise.resolve(app.minimizeApp()).catch(report);
      }
    } catch (error) { report(error); }
  });
  return {
    ready: Promise.all(registrations),
    async dispose() {
      if (disposed) return;
      disposed = true;
      const existing = [...handles]; handles.clear();
      await Promise.all(existing.map(handle => Promise.resolve().then(() => handle.remove()).catch(report)));
      await Promise.all(registrations);
    }
  };
}

export function mountNativeGameBridge(app, target = globalThis.window, { onError } = {}) {
  if (!target || typeof target.dispatchEvent !== 'function') throw new TypeError('Game event target is required');
  const EventClass = target.CustomEvent || globalThis.CustomEvent;
  if (typeof EventClass !== 'function') throw new TypeError('CustomEvent is required');
  return bindNativeLifecycle(app, {
    onInactive: () => target.dispatchEvent(new EventClass('dead-signal:app-state', { detail: { isActive: false } })),
    onActive: () => target.dispatchEvent(new EventClass('dead-signal:app-state', { detail: { isActive: true } })),
    onBack: () => !target.dispatchEvent(new EventClass('dead-signal:back', { cancelable: true })),
    onError
  });
}
