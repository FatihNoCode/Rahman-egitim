// Error tracking (Sentry) and product analytics (PostHog) setup.
//
// Both keys below are public client identifiers, not secrets — Sentry DSNs
// and PostHog project API keys are designed to be shipped in the browser and
// are scoped by the respective dashboards, the same way the Supabase anon key
// in utils/supabase/info.ts is. Hardcoding them as the fallback keeps CI and
// local builds working even when no VITE_* env is provided.

import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';
import posthog from 'posthog-js';
import { APP_VERSION } from './version';

const SENTRY_DSN =
  import.meta.env.VITE_SENTRY_DSN ||
  'https://1230c4d3294e32632ad7f21f0ca956c2@o4511921014505472.ingest.de.sentry.io/4511921049567312';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || 'phc_qYC7EC389QRe33JZWtPtpNMgh7FVTXE4xuLaxDj3nSWv';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

let installed = false;

/** Called once from main.tsx, before the app renders. */
export function installMonitoring() {
  if (installed) return;
  installed = true;

  Sentry.init(
    {
      dsn: SENTRY_DSN,
      release: `rahman-egitim@${APP_VERSION}`,
      tracesSampleRate: 0.2,
    },
    SentryReact.init,
  );

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
  });
}
