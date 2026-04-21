/**
 * Mapa Leaflet para seleccionar origen y destino.
 * - Búsqueda por texto (Nominatim/OSM) + clic en mapa
 * - Primer clic/búsqueda: coloca marcador ORIGEN (verde)
 * - Segundo: coloca marcador DESTINO (rojo)
 */
import {useRef, useEffect, useState, useCallback} from 'react';
import L from 'leaflet';

const makeIcon = (color, label) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:28px;height:36px">
    <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.35)"></div>
    <span style="position:absolute;top:4px;left:0;width:28px;text-align:center;color:#fff;font-size:11px;font-weight:700">${label}</span>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

const originIcon = makeIcon('#1D9E75', 'A');
const destIcon   = makeIcon('#D85A30', 'B');

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=pe`;
  const res  = await fetch(url, {headers: {'Accept-Language': 'es'}});
  return res.json();
}

export default function LocationPickerMap({onChange}) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const originRef    = useRef(null);
  const destRef      = useRef(null);
  const stepRef      = useRef('origin');

  const [origin,      setOrigin]      = useState(null);
  const [destination, setDestination] = useState(null);
  const [step,        setStep]        = useState('origin');

  // Search state
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [showResults,   setShowResults]   = useState(false);

  const placeMarker = useCallback((lat, lng, type) => {
    const map = mapRef.current;
    if (!map) return;

    if (type === 'origin') {
      if (originRef.current) originRef.current.setLatLng([lat, lng]);
      else originRef.current = L.marker([lat, lng], {icon: originIcon}).bindPopup('<strong>Origen</strong>').addTo(map);
      const orig = {lat, lng};
      setOrigin(orig);
      setStep('destination');
      stepRef.current = 'destination';
      onChange?.({origin: orig, destination: null});
    } else {
      if (destRef.current) destRef.current.setLatLng([lat, lng]);
      else destRef.current = L.marker([lat, lng], {icon: destIcon}).bindPopup('<strong>Destino</strong>').addTo(map);
      const dest = {lat, lng};
      setDestination(dest);
      setStep('origin');
      stepRef.current = 'origin';
      setOrigin(orig => { onChange?.({origin: orig, destination: dest}); return orig; });
    }
    map.flyTo([lat, lng], 16, {animate: true, duration: 1});
  }, [onChange]);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {center: [-12.0464, -77.0428], zoom: 12});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);
    map.getContainer().style.cursor = 'crosshair';

    map.on('click', e => {
      const {lat, lng} = e.latlng;
      placeMarker(lat, lng, stepRef.current);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = originRef.current = destRef.current = null;
    };
  }, []);

  // Re-bind placeMarker after mount (closure update)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.off('click');
    map.on('click', e => placeMarker(e.latlng.lat, e.latlng.lng, stepRef.current));
  }, [placeMarker]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    setShowResults(false);
    try {
      const results = await geocode(searchQuery);
      setSearchResults(results);
      setShowResults(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    placeMarker(lat, lng, stepRef.current);
    setSearchQuery(result.display_name.split(',').slice(0, 2).join(','));
    setShowResults(false);
  };

  const reset = () => {
    originRef.current?.remove(); originRef.current = null;
    destRef.current?.remove();   destRef.current   = null;
    stepRef.current = 'origin';
    setOrigin(null); setDestination(null); setStep('origin');
    setSearchQuery(''); setSearchResults([]); setShowResults(false);
    onChange?.({origin: null, destination: null});
  };

  return (
    <div className="flex flex-col gap-2">

      {/* Step indicators */}
      <div className="flex items-center gap-3 text-xs mb-1">
        <span className={`flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full transition ${
          step === 'origin' ? 'bg-teal/15 text-teal' : origin ? 'bg-teal/10 text-teal/60' : 'text-gray-400'}`}>
          <span className="w-3 h-3 rounded-full bg-teal inline-block shrink-0" />
          {origin ? `Origen: ${origin.lat.toFixed(5)}, ${origin.lng.toFixed(5)}` : 'Marcar origen'}
        </span>
        <span className="text-gray-300 shrink-0">→</span>
        <span className={`flex items-center gap-1.5 font-semibold px-2.5 py-1 rounded-full transition ${
          step === 'destination' ? 'bg-coral/15 text-coral' : destination ? 'bg-coral/10 text-coral/60' : 'text-gray-400'}`}>
          <span className="w-3 h-3 rounded-full bg-coral inline-block shrink-0" />
          {destination ? `Destino: ${destination.lat.toFixed(5)}, ${destination.lng.toFixed(5)}` : 'Marcar destino'}
        </span>
        {(origin || destination) && (
          <button onClick={reset} className="ml-auto text-xs text-gray-400 hover:text-coral transition">
            Limpiar
          </button>
        )}
      </div>

      {/* Search bar */}
      <div className="relative">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setShowResults(false); }}
              placeholder={step === 'origin' ? 'Buscar dirección de origen...' : 'Buscar dirección de destino...'}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand/30 bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-xl hover:bg-brand/90 disabled:opacity-50 transition shrink-0">
            {searching ? '...' : 'Buscar'}
          </button>
        </form>

        {/* Search dropdown results */}
        {showResults && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[2000] max-h-48 overflow-y-auto">
            {searchResults.map((r, i) => (
              <button
                key={i}
                onClick={() => selectResult(r)}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 border-b border-gray-50 last:border-0 transition">
                <p className="font-medium text-gray-800 truncate">
                  {r.display_name.split(',').slice(0, 2).join(',')}
                </p>
                <p className="text-gray-400 truncate">{r.display_name.split(',').slice(2, 4).join(',')}</p>
              </button>
            ))}
          </div>
        )}
        {showResults && searchResults.length === 0 && !searching && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[2000] px-4 py-3 text-xs text-gray-400">
            Sin resultados. Intenta con otra dirección.
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        style={{height: 320}}
        className="rounded-xl overflow-hidden border border-gray-200"
        onClick={() => setShowResults(false)}
      />

      <p className="text-xs text-gray-400 text-center">
        {!origin && 'Busca una dirección o haz clic en el mapa para marcar el origen (A).'}
        {origin && !destination && 'Ahora busca o haz clic para marcar el destino (B).'}
        {origin && destination && 'Puedes ajustar haciendo clic de nuevo o buscando otra dirección.'}
      </p>
    </div>
  );
}
