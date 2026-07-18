import { Capacitor } from '@capacitor/core';

export function isNative() {
  return Capacitor.isNativePlatform();
}

export function isIOS() {
  return Capacitor.getPlatform() === 'ios';
}

export function isAndroid() {
  return Capacitor.getPlatform() === 'android';
}

// Tags <html> so the stylesheet can target the shell and the concrete platform
// (see src/styles/native.css). Doing it here rather than in a component keeps
// the classes on the element before first paint, so there's no frame where the
// app renders with web defaults — on iOS that frame is visible as the layout
// jumping down once the safe-area padding lands.
export function applyPlatformClasses() {
  try {
    const root = document.documentElement;
    if (isAppLayout()) root.classList.add('native-app');
    // Capacitor reports 'web' off-device; the `?app=1` preview still wants the
    // iOS rules so the layout can be checked in a desktop browser.
    const platform = Capacitor.getPlatform();
    if (platform !== 'web') root.classList.add(`platform-${platform}`);
  } catch {
    /* SSR / no DOM — nothing to tag */
  }
}

// Whether to render the mobile "app" chrome (bottom tab bar, no page header,
// full-bleed layout) instead of the desktop website layout. True inside the
// Capacitor shell. On the web it can be forced with `?app=1` (persisted for the
// session) so the app layout can be previewed in a browser without a device.
export function isAppLayout() {
  if (isNative()) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1') {
      localStorage.setItem('force_app_layout', '1');
      return true;
    }
    if (params.get('app') === '0') {
      localStorage.removeItem('force_app_layout');
      return false;
    }
    return localStorage.getItem('force_app_layout') === '1';
  } catch {
    return false;
  }
}

// On the web the app is served from its own origin, so Supabase can redirect
// straight back to it. Inside the Capacitor shell the origin is
// https://localhost, which Google rejects as a redirect target and which turns
// password-reset links into dead ends on the user's phone. Native builds route
// back through a custom scheme instead, registered in AndroidManifest.xml.
export const NATIVE_AUTH_SCHEME = 'com.rahmanegitim.app';
export const NATIVE_AUTH_REDIRECT = `${NATIVE_AUTH_SCHEME}://auth-callback`;

export function getAuthRedirectTo() {
  return isNative() ? NATIVE_AUTH_REDIRECT : window.location.origin;
}
