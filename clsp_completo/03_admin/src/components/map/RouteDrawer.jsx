/**
 * Mapa Leaflet para trazar rutas.
 * - Clic en el mapa agrega puntos a la ruta.
 * - Los puntos se conectan con una Polyline morada.
 * - "Borrar ruta" limpia todos los puntos.
 * - Acepta `autoRoute` (GeoJSON LineString) para cargar una ruta automática.
 * - Acepta `stops` ([{lat,lng,description}]) y los muestra como P1, P2…
 */
import {useRef, useEffect, useState, useCallback} from 'react';
import L from 'leaflet';

const pointIcon = L.divIcon({
  className: '',
  html: `<div style="width:10px;height:10px;border-radius:50%;background:#534AB7;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

const originIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:28px;height:36px">
    <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#1D9E75;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.35)"></div>
    <span style="position:absolute;top:5px;left:0;width:28px;text-align:center;color:#fff;font-size:11px;font-weight:700">A</span>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

const destIcon = L.divIcon({
  className: '',
  html: `<div style="position:relative;width:28px;height:36px">
    <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#D85A30;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.35)"></div>
    <span style="position:absolute;top:5px;left:0;width:28px;text-align:center;color:#fff;font-size:11px;font-weight:700">B</span>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

const makeWaypointIcon = (num) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:28px;height:36px">
    <div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#0EA5E9;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.35)"></div>
    <span style="position:absolute;top:3px;left:0;width:28px;text-align:center;color:#fff;font-size:9px;font-weight:700">P${num}</span>
  </div>`,
  iconSize: [28, 36],
  iconAnchor: [14, 34],
});

export default function RouteDrawer({origin, destination, onRouteChange, autoRoute, stops = []}) {
  const containerRef      = useRef(null);
  const mapRef            = useRef(null);
  const polylineRef       = useRef(null);
  const pointMarkersRef   = useRef([]);
  const waypointMarkersRef = useRef([]);
  const coordsRef         = useRef([]);
  const [hasRoute, setHasRoute] = useState(false);

  const emitRoute = useCallback((coords) => {
    if (coords.length >= 2) {
      onRouteChange?.({
        type: 'LineString',
        coordinates: coords.map(([lat, lng]) => [lng, lat]),
      });
      setHasRoute(true);
    } else {
      onRouteChange?.(null);
      setHasRoute(false);
    }
  }, [onRouteChange]);

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center = origin ? [origin.lat, origin.lng] : [-12.0464, -77.0428];
    const map = L.map(containerRef.current, {center, zoom: 13});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    polylineRef.current = L.polyline([], {color: '#534AB7', weight: 4, opacity: 0.9}).addTo(map);

    if (origin) {
      L.marker([origin.lat, origin.lng], {icon: originIcon})
        .bindPopup('<strong>A — Origen</strong>').addTo(map);
    }
    if (destination) {
      L.marker([destination.lat, destination.lng], {icon: destIcon})
        .bindPopup('<strong>B — Destino</strong>').addTo(map);
    }

    if (origin && destination) {
      map.fitBounds(
        [[origin.lat, origin.lng], [destination.lat, destination.lng]],
        {padding: [60, 60], maxZoom: 15},
      );
    }

    map.getContainer().style.cursor = 'crosshair';

    map.on('click', e => {
      const {lat, lng} = e.latlng;
      coordsRef.current = [...coordsRef.current, [lat, lng]];
      polylineRef.current.setLatLngs(coordsRef.current);
      const marker = L.marker([lat, lng], {icon: pointIcon}).addTo(map);
      pointMarkersRef.current.push(marker);
      emitRoute(coordsRef.current);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      polylineRef.current = null;
      pointMarkersRef.current = [];
      waypointMarkersRef.current = [];
      coordsRef.current = [];
    };
  }, []);

  // ── Actualizar marcadores de paradas intermedias ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Limpiar waypoints anteriores
    waypointMarkersRef.current.forEach(m => m.remove());
    waypointMarkersRef.current = [];

    // Agregar nuevos waypoints
    stops.forEach((stop, i) => {
      const marker = L.marker([stop.lat, stop.lng], {icon: makeWaypointIcon(i + 1)})
        .bindPopup(`<strong>P${i + 1}</strong><br/>${stop.description || ''}`)
        .addTo(map);
      waypointMarkersRef.current.push(marker);
    });
  }, [stops]);

  // ── Cargar ruta automática ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoRoute?.coordinates?.length) return;

    pointMarkersRef.current.forEach(m => m.remove());
    pointMarkersRef.current = [];

    const latLngs = autoRoute.coordinates.map(([lng, lat]) => [lat, lng]);
    coordsRef.current = latLngs;
    polylineRef.current?.setLatLngs(latLngs);

    setHasRoute(true);
    onRouteChange?.(autoRoute);

    if (latLngs.length > 1) {
      map.fitBounds(latLngs, {padding: [60, 60], maxZoom: 15});
    }
  }, [autoRoute]);

  const clearRoute = useCallback(() => {
    pointMarkersRef.current.forEach(m => m.remove());
    pointMarkersRef.current = [];
    coordsRef.current = [];
    polylineRef.current?.setLatLngs([]);
    setHasRoute(false);
    onRouteChange?.(null);
  }, [onRouteChange]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          {hasRoute
            ? `Ruta con ${coordsRef.current.length} puntos. Haz clic para agregar más.`
            : 'Haz clic en el mapa para trazar la ruta. Mínimo 2 puntos.'}
        </span>
        {hasRoute && (
          <button onClick={clearRoute} className="text-coral hover:underline">
            Borrar ruta
          </button>
        )}
      </div>

      {/* Leyenda de marcadores */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-teal inline-block" /> A — Origen
        </span>
        {stops.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-sky-500 inline-block" />
            P{i + 1} — {s.description?.split(',')[0] || `Parada ${i + 1}`}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-coral inline-block" /> B — Destino
        </span>
      </div>

      <div
        ref={containerRef}
        style={{height: 420}}
        className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
      />
      {!hasRoute && (
        <p className="text-xs text-amber font-medium text-center">
          Usa "Mejor ruta disponible" o traza la ruta manualmente en el mapa.
        </p>
      )}
      {hasRoute && (
        <p className="text-xs text-teal font-medium text-center">
          ✓ Ruta lista. Puedes continuar con la aprobación.
        </p>
      )}
    </div>
  );
}
