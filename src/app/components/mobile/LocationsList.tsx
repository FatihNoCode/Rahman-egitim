import { useMemo, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import type { LocationRecord } from '../LocationsMap';
import { matchesAny } from '../../../lib/search';

interface LocationsListProps {
  locations: LocationRecord[];
  selectedId: string | null;
  onSelect: (location: LocationRecord) => void;
  t: Record<string, string>;
}

// The phone stand-in for LocationsMap.
//
// The map earns its place on a desktop: a superadmin scanning the country for
// where the branches actually are reads a map far faster than a list. On a
// phone it stops paying for itself — the pins collapse into an unreadable
// cluster over the Randstad at the only zoom level that fits the screen, and
// hitting one with a thumb is a coin flip. Worse, it drags the whole Leaflet
// bundle plus tile downloads onto a mobile connection to do it.
//
// Searching is what the phone is genuinely better at, so that's what this is:
// the same list panel the map already shows beside itself, given the full
// width and wired to the same onSelect. Picking a branch opens exactly the
// same detail view either way, so nothing downstream has to know which one the
// user came through.
export default function LocationsList({ locations, selectedId, onSelect, t }: LocationsListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return locations;
    return locations.filter((l) => matchesAny([l.name, l.city], query));
  }, [locations, query]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchLocations}
          className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">{t.noLocationsFound}</p>
      ) : (
        <ul className="space-y-1">
          {filtered.map((loc) => (
            <li key={loc.id}>
              <button
                onClick={() => onSelect(loc)}
                className={`flex w-full items-start gap-2 rounded-xl px-3 py-3 text-left transition active:scale-[0.98] ${
                  loc.id === selectedId ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'active:bg-gray-50'
                }`}
              >
                <MapPin
                  className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                    (loc.schoolCount || 0) > 0 ? 'text-emerald-600' : 'text-gray-300'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-800">{loc.name}</span>
                  <span className="block text-xs text-gray-400">
                    {loc.city}
                    {(loc.schoolCount || 0) > 0 && ` · ${loc.schoolCount} ${t.schoolCount}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
