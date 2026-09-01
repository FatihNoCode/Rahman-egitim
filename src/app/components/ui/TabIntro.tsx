import { Info } from 'lucide-react';

/**
 * One line saying what a destination is for.
 *
 * The tab bars in this app are short nouns — "Cases", "Signalen",
 * "Lesregistratie" — which are perfectly clear to whoever named them and a
 * guess for everyone else. A person who opens a tab and cannot tell within a
 * second whether it is the right one does not explore; they go back and stop
 * looking. So every destination whose name does not fully explain itself
 * carries a sentence, in the reader's own language, at the top.
 *
 * Deliberately not dismissible: it takes one line, it is read past in a
 * glance once you know the screen, and a hint that can be turned off is a
 * hint that is missing for the person who comes back after the summer.
 */
export default function TabIntro({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mb-4 flex items-start gap-1.5 text-xs text-gray-500 ${className}`}>
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
