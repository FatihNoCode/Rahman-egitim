import { Monitor, ExternalLink } from 'lucide-react';
import { isNative } from '../../../lib/native';
import type { Language } from '../../App';

// The website the app is a companion to. Deep-linked with the dashboard's own
// hash so "open on the website" lands on the same screen the user was already
// trying to reach, signed in, rather than dumping them on the front page to
// navigate back down by hand.
const SITE = 'https://rahmanegitim.com';

interface DesktopOnlyProps {
  language: Language;
  // What can't be done here, named the way the user would name it
  // ("Toets maken", not "ExamBuilder") — this is the sentence's subject.
  title: string;
  // Why it isn't in the app. Always a reason about the work, never about the
  // phone being "unsupported": these features are absent by choice, and saying
  // so is the difference between a considered limit and a broken app.
  reason: string;
  // Hash of the tab to open on the website, e.g. 'toets'.
  tab?: string;
}

// Shown in place of a feature that stays on the website.
//
// Some of this app's work genuinely does not fit a phone: an exam is authored
// across a wide grid of questions, and a spreadsheet import is a table
// hundreds of rows long. Squeezing either into a 390pt screen produces
// something that technically renders and that nobody can actually use, and a
// half-working exam builder is worse than an honest pointer to the desktop —
// a teacher who discovers the limitation halfway through writing a toets has
// lost the toets.
//
// So the tab still exists, still carries its name, and explains itself. What
// it never does is pretend the feature is missing or broken.
export default function DesktopOnly({ language, title, reason, tab }: DesktopOnlyProps) {
  const tr = language === 'tr';
  // Matches the shape useHashTab reads and writes (#tab=import), so the site
  // opens on the tab the user was standing on rather than its default one.
  const url = tab ? `${SITE}/#tab=${tab}` : SITE;

  const open = async () => {
    if (isNative()) {
      // In-app browser rather than kicking the user out to Safari/Chrome —
      // they come back with a swipe instead of an app switch.
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
        <Monitor className="h-7 w-7 text-emerald-600" />
      </span>
      <h2 className="mb-1.5 text-lg font-semibold text-gray-800">{title}</h2>
      <p className="mb-5 text-sm leading-relaxed text-gray-500">{reason}</p>
      <button
        type="button"
        onClick={open}
        className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95"
      >
        <ExternalLink className="h-4 w-4" />
        {tr ? 'Web sitesinde aç' : 'Openen op de website'}
      </button>
      <p className="mt-3 text-xs text-gray-400">rahmanegitim.com</p>
    </div>
  );
}
