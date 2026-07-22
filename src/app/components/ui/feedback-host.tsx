"use client";

// The rendering half of the feedback layer — sonner's Toaster plus the Radix
// alert-dialog. Split out from feedback.tsx because these two together are
// ~140 KB of the bundle that paint nothing until someone is actually notified,
// so they have no business on the boot path. feedback.tsx loads this chunk
// right after mount and registers the handlers below; see the comments there
// for how calls made before it lands are handled.

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
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
import { isAppLayout } from "../../../lib/native";
import { registerConfirmHost, type PendingConfirm } from "./feedback";

export { toast } from "sonner";

export function FeedbackHostImpl() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => registerConfirmHost((c) => {
    setPending(c);
    setOpen(true);
  }), []);

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
      {/* On iOS the WebView extends under the status bar and the notch, so a
          toast at sonner's default 32px offset lands *behind* them — the top of
          "Niet gevonden" was being clipped by the Dynamic Island. Clear the
          safe-area inset first, then apply a normal gap below it. */}
      <Toaster
        richColors
        closeButton
        position="top-center"
        offset={isAppLayout() ? 'calc(var(--safe-top) + 20px)' : undefined}
      />
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
