"use client";

// Custom, in-app replacements for the browser's native alert()/confirm()
// dialogs. `notify` renders our own toast (sonner) and `confirmDialog` opens
// a styled Radix alert-dialog resolved through a promise, so callers can keep
// the simple imperative shape (`if (!(await confirmDialog(...))) return;`)
// without wiring dialog state into every component.
//
// This module is deliberately the *light* half of that: it holds the API every
// view imports, and nothing else. sonner and the Radix dialog live in
// ./feedback-host and are fetched in their own chunk once <FeedbackHost/>
// mounts — together they are ~140 KB that paint nothing until something is
// actually raised, so keeping them off the boot path is worth the indirection.
//
// Anything raised before that chunk lands is queued, not dropped. In practice
// the window is tiny (the host starts loading at app mount, and every caller
// lives inside a lazily-loaded dashboard), but a toast that vanishes because
// of a race is exactly the kind of bug nobody manages to reproduce.

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { logError } from "../../../lib/deviceLog";

type FeedbackHostModule = typeof import("./feedback-host");
type ToastApi = FeedbackHostModule["toast"];

let impl: FeedbackHostModule | null = null;
let implPromise: Promise<FeedbackHostModule> | null = null;
let hostMounted = false;
const queuedToasts: Array<(toast: ToastApi) => void> = [];

function loadImpl(): Promise<FeedbackHostModule> {
  implPromise ??= import("./feedback-host").then((mod) => {
    impl = mod;
    return mod;
  });
  return implPromise;
}

function raise(fn: (toast: ToastApi) => void) {
  if (hostMounted && impl) {
    fn(impl.toast);
    return;
  }
  queuedToasts.push(fn);
  void loadImpl();
}

// ---------------- Toast (alert replacement) ----------------

export const notify = {
  success: (message: string) => raise((toast) => toast.success(message)),
  // Every error the user is actually shown goes into the on-device log too, so
  // "it said not found" can be reported with the steps that led to it. Written
  // synchronously rather than from the queue, so an error raised while the app
  // is failing is still recorded even if the toast chunk never arrives.
  error: (message: string) => {
    logError('Melding', message);
    raise((toast) => toast.error(message));
  },
  info: (message: string) => raise((toast) => toast(message)),
  message: (message: string) => raise((toast) => toast(message)),
};

// ---------------- Confirm dialog (confirm replacement) ----------------

export interface ConfirmOptions {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  destructive?: boolean;
}

export interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let emit: ((c: PendingConfirm) => void) | null = null;
let markHostMounted: (() => void) | null = null;
const hostReady = new Promise<void>((resolve) => {
  markHostMounted = resolve;
});

/**
 * Called by <FeedbackHostImpl/> once it is able to display a dialog. Returns
 * the teardown for its effect.
 */
export function registerConfirmHost(fn: (c: PendingConfirm) => void) {
  emit = fn;
  hostMounted = true;
  markHostMounted?.();
  // Drain here rather than when the chunk finishes downloading. sonner only
  // delivers a toast to subscribers that already exist when it is published,
  // so anything replayed before <Toaster/> has mounted is thrown away with no
  // trace. This effect runs after the child Toaster's own effect has
  // subscribed, which makes it the first safe moment. Order is preserved, so a
  // success/error pair still reads correctly.
  if (impl) for (const fn of queuedToasts.splice(0)) fn(impl.toast);
  return () => {
    emit = null;
    hostMounted = false;
  };
}

/**
 * Opens a custom confirm dialog and resolves to true (confirmed) or false
 * (cancelled/dismissed). Drop-in async replacement for window.confirm().
 */
export async function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  void loadImpl();
  // Fail closed (treat as cancelled) rather than hang if the host never
  // arrives: an offline reload can leave the chunk unfetchable, and a confirm()
  // that never settles would strand the calling flow with no way out.
  const arrived = await Promise.race([
    hostReady.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!arrived || !emit) return false;
  return new Promise((resolve) => emit!({ ...options, resolve }));
}

/**
 * Mounted once near the app root. Hosts the toast portal and the confirm
 * dialog. Without this, `notify`/`confirmDialog` are no-ops.
 *
 * Renders nothing until its chunk lands, so it never holds up first paint.
 */
export function FeedbackHost() {
  const [Host, setHost] = useState<ComponentType | null>(null);

  useEffect(() => {
    let alive = true;
    loadImpl().then((mod) => {
      if (alive) setHost(() => mod.FeedbackHostImpl);
    });
    return () => {
      alive = false;
    };
  }, []);

  return Host ? <Host /> : null;
}
