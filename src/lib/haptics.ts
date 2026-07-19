import { isNative } from './native';

// Thin wrapper over @capacitor/haptics. Everything here is fire-and-forget and
// swallows its errors: haptics are a nicety, and a device with the Taptic
// Engine disabled (or a web build, where the plugin isn't there at all) must
// not turn a tab tap into an unhandled rejection.
//
// The three selection* calls mirror UIKit's UISelectionFeedbackGenerator, which
// is what iOS itself uses for a segmented control you drag across: `start` when
// the finger lands, `changed` on every value the finger crosses, `end` on
// release. Using impact() for this instead is the usual mistake — it's a
// heavier thud meant for collisions, and it feels wrong when it fires five
// times in one swipe.

let mod: typeof import('@capacitor/haptics') | null = null;

async function haptics() {
  if (!isNative()) return null;
  if (!mod) mod = await import('@capacitor/haptics');
  return mod;
}

export function selectionStart() {
  haptics().then((h) => h?.Haptics.selectionStart()).catch(() => {});
}

export function selectionChanged() {
  haptics().then((h) => h?.Haptics.selectionChanged()).catch(() => {});
}

export function selectionEnd() {
  haptics().then((h) => h?.Haptics.selectionEnd()).catch(() => {});
}
