import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { mountNativeGameBridge } from './native-lifecycle.mjs';

// The native runtime marker must exist before the game selects its controls.
const native = Capacitor.isNativePlatform();
document.documentElement.dataset.nativeRuntime = String(native);
await import('./app.js?v=0.26.0');
if (native) {
  const bridge = mountNativeGameBridge(App, window, {
    onError: error => console.warn('Native lifecycle unavailable:', error?.message || 'unknown')
  });
  await bridge.ready;
  // Read the current native state after registration in case launch started inactive.
  try {
    const state = await App.getState();
    if (state.isActive === false) window.dispatchEvent(new CustomEvent('dead-signal:app-state', { detail: state }));
  } catch {}
}
