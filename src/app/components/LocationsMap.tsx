import { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search } from 'lucide-react';
import { NETHERLANDS_LAND } from './netherlandsBorder';
import { matchesAny } from '../../lib/search';

export interface LocationRecord {
  id: string;
  name: string;
  city: string;
  address?: string;
  website?: string;
  lat: number;
  lng: number;
  active: boolean;
  schoolCount?: number;
  region?: 'north' | 'south' | null;
}

interface LocationsMapProps {
  locations: LocationRecord[];
  selectedId: string | null;
  onSelect: (location: LocationRecord) => void;
  t: Record<string, string>;
}

// The map is pinned to the Netherlands — every branch sits inside it, and there
// is nothing for a superadmin to find by panning off into the North Sea. Padded
// slightly beyond the border so the outermost pins aren't flush against an edge.
const NL_BOUNDS = L.latLngBounds([50.6, 3.1], [53.7, 7.3]);

// Zooming all the way out until the whole country fits leaves it small and
// ringed by neighbours. The zoom-out limit is instead taken from a box 84% of
// that size, so the furthest-out view is a touch tighter and the Netherlands
// sits large and centred. Panning still covers NL_BOUNDS, so the strip this
// crops stays reachable and no pin is stranded.
const ZOOM_OUT_BOUNDS = NL_BOUNDS.pad(-0.08);

// Zoom is logarithmic (each whole level doubles the scale), so a "4% tighter"
// default/floor is +log2(1.04) levels, not a 4% change to a bounds fraction.
const ZOOM_BOOST = Math.log2(1.04);

// Outer ring of the dimming mask. Spans the whole world so the mask still
// covers the corners at the furthest-out zoom, whatever the pane's shape.
const WORLD_RING: [number, number][] = [
  [-90, -180],
  [-90, 180],
  [90, 180],
  [90, -180],
];

// Leaflet's default marker points at image files that a bundler won't resolve,
// so pins are drawn as inline HTML instead — that also lets a selected pin and
// a pin with lesson types look different without shipping extra assets.
function pinIcon(selected: boolean, hasSchools: boolean) {
  const fill = selected ? '#047857' : hasSchools ? '#10b981' : '#9ca3af';
  return L.divIcon({
    className: '',
    html: `<div style="transform:translate(-50%,-100%);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
      <svg width="${selected ? 34 : 26}" height="${selected ? 34 : 26}" viewBox="0 0 24 24" fill="${fill}" stroke="white" stroke-width="1.5">
        <path d="M12 22s8-6.4 8-12a8 8 0 1 0-16 0c0 5.6 8 12 8 12z"/>
        <circle cx="12" cy="10" r="2.6" fill="white" stroke="none"/>
      </svg></div>`,
    iconSize: [0, 0],
  });
}

export default function LocationsMap({ locations, selectedId, onSelect, t }: LocationsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  // onSelect is re-created every render; a ref keeps the marker click handler
  // current without tearing down and rebuilding every marker.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return locations;
    return locations.filter((l) => matchesAny([l.name, l.city], query));
  }, [locations, query]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      scrollWheelZoom: true,
      // Panning and zooming stay free inside the Netherlands, but the viewport
      // can't leave it: maxBounds blocks the pan, and the minZoom set below
      // stops the map zooming out far enough to show the rest of Europe.
      maxBounds: NL_BOUNDS,
      maxBoundsViscosity: 1,
      maxZoom: 19,
      // Continuous zoom rather than whole/quarter steps: Leaflet's snapping
      // rounds every setZoom() call to the nearest zoomSnap multiple, which
      // silently ate the ZOOM_BOOST adjustment below on some screen sizes
      // (it landed short of the next 0.25 step and rounded back down to the
      // unboosted value). Zero snap makes the computed zoom apply exactly,
      // every time, at the cost of the zoom control's +/- moving by a full
      // level instead of a quarter — a fine trade for a fixed, non-interactive
      // view like this one.
      zoomSnap: 0,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    // Derive the furthest-out zoom from the container rather than hardcoding a
    // level, so the limit holds at any pane size. Recomputed on resize.
    const clampZoomOut = () => {
      const min = map.getBoundsZoom(ZOOM_OUT_BOUNDS) + ZOOM_BOOST;
      map.setMinZoom(min);
      if (map.getZoom() < min) map.setZoom(min);
    };
    map.fitBounds(ZOOM_OUT_BOUNDS);
    clampZoomOut();
    map.on('resize', clampZoomOut);

    // Everything outside the coastline is dimmed so the Netherlands reads as
    // the subject of the map. Leaflet fills a multi-ring polygon with the
    // even-odd rule, so a world-sized ring followed by each landmass paints
    // the surroundings and leaves the country itself untouched. Kept light: it
    // should let the neighbours recede, not black them out.
    L.polygon([WORLD_RING, ...NETHERLANDS_LAND], {
      interactive: false,
      stroke: false,
      fillColor: '#64748b',
      fillOpacity: 0.22,
    }).addTo(map);

    NETHERLANDS_LAND.forEach((ring) => {
      L.polygon(ring, {
        interactive: false,
        fill: false,
        color: '#047857',
        weight: 1.25,
        opacity: 0.55,
      }).addTo(map);
    });

    mapRef.current = map;

    // Leaflet caches the container's pixel size at creation time and only
    // that cached size, not the actual DOM box; if the container's real size
    // settles afterwards — a webfont or the sidebar list's content loading in,
    // a responsive breakpoint change — every pane (tiles, the dimming overlay,
    // markers) stays clipped to the stale size, leaving a blank strip where
    // the container grew. Watch the container itself and resync on any change.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    locations.forEach((loc) => {
      const marker = L.marker([loc.lat, loc.lng], {
        icon: pinIcon(loc.id === selectedId, (loc.schoolCount || 0) > 0),
        zIndexOffset: loc.id === selectedId ? 1000 : 0,
      })
        .addTo(map)
        .bindTooltip(`${loc.name} — ${loc.city}`, { direction: 'top', offset: [0, -28] })
        .on('click', () => onSelectRef.current(loc));
      markersRef.current[loc.id] = marker;
    });
  }, [locations, selectedId]);

  // Pan to whichever location was picked, whether from the map or the sidebar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const loc = locations.find((l) => l.id === selectedId);
    if (loc) map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
  }, [selectedId, locations]);

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="md:w-72 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 p-3 flex flex-col">
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchLocations}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="overflow-y-auto max-h-[26rem] md:max-h-[30rem] -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">{t.noLocationsFound}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((loc) => (
                <li key={loc.id}>
                  <button
                    onClick={() => onSelect(loc)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition flex items-start gap-2 ${
                      loc.id === selectedId ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-gray-50'
                    }`}
                  >
                    <MapPin
                      className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                        (loc.schoolCount || 0) > 0 ? 'text-emerald-600' : 'text-gray-300'
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-800 truncate">{loc.name}</span>
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
      </div>

      <div className="flex-1 min-w-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div ref={containerRef} className="h-[24rem] md:h-[34rem] w-full z-0" />
      </div>
    </div>
  );
}
