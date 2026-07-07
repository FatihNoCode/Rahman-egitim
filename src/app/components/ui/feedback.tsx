"use client";

// Custom, in-app replacements for the browser's native alert()/confirm()
// dialogs. `notify` renders our own toast (sonner) and `confirmDialog` opens
// a styled Radix alert-dialog resolved through a promise, so callers can keep
// the simple imperative shape (`if (!(await confirmDialog(...))) return;`)
// without wiring dialog state into every component.

import { useEffect, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

// ---------------- Toast (alert replacement) ----------------

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) => toast(message),
  message: (message: string) => toast(message),
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

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let emit: ((c: PendingConfirm) => void) | null = null;

/**
 * Opens a custom confirm dialog and resolves to true (confirmed) or false
 * (cancelled/dismissed). Drop-in async replacement for window.confirm().
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!emit) {
      // Host not mounted yet — fail closed (treat as cancelled).
      resolve(false);
      return;
    }
    emit({ ...options, resolve });
  });
}

/**
 * Mounted once near the app root. Hosts the toast portal and the confirm
 * dialog. Without this, `notify`/`confirmDialog` are no-ops.
 */
export function FeedbackHost() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    emit = (c) => {
      setPending(c);
      setOpen(true);
    };
    return () => {
      emit = null;
    };
  }, []);

  const close = (result: boolean) => {
    setOpen(false);
    // Resolve after the close animation so the promise settles once.
    const p = pending;
    setTimeout(() => {
      p?.resolve(result);
      setPending(null);
    }, 150);
  };

  return (
    <>
      <Toaster richColors closeButton position="top-center" />
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!o) close(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            {pending?.title ? (
              <AlertDialogTitle>{pending.title}</AlertDialogTitle>
            ) : null}
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {pending?.cancelLabel ?? "Annuleren"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={
                pending?.destructive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : undefined
              }
              onClick={() => close(true)}
            >
              {pending?.confirmLabel ?? "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
