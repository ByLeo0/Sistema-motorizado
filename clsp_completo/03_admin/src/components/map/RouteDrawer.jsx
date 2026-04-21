/**
 * Mapa Leaflet para trazar rutas.
 * - Clic en el mapa agrega puntos a la ruta.
 * - Los puntos se conectan con una Polyline morada.
 * - "Borrar ruta" limpia todos los puntos.
 * - Acepta `autoRoute` (GeoJSON LineString) para cargar una ruta automática.
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
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#1D9E75;border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const destIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#D85A30;border:3px solid #fff;box-shadow:0 2px 5px rgba(0,0,0,0.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function RouteDrawer({origin, destination, onRouteChange, autoRoute}) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const polylineRef   = useRef(null);
  const pointMarkersRef = useRef([]);
  const coordsRef     = useRef([]);
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

    // Polyline de la ruta dibujada
    polylineRef.current = L.polyline([], {color: '#534AB7', weight: 4, opacity: 0.9}).addTo(map);

    // Marcadores fijos de origen / destino
    if (origin) {
      L.marker([origin.lat, origin.lng], {icon: originIcon})
        .bindPopup('Origen').addTo(map);
    }
    if (destination) {
      L.marker([destination.lat, destination.lng], {icon: destIcon})
        .bindPopup('Destino').addTo(map);
    }

    // Ajustar vista
    if (origin && destination) {
      map.fitBounds(
        [[origin.lat, origin.lng], [destination.lat, destination.lng]],
        {padding: [60, 60], maxZoom: 15},
      );
    }

    map.getContainer().style.cursor = 'crosshair';

    // Clic agrega punto a la ruta
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
      coordsRef.current = [];
    };
  }, []);

  // ── Cargar ruta automática ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !autoRoute?.coordinates?.length) return;

    // Limpiar puntos anteriores
    pointMarkersRef.current.forEach(m => m.remove());
    pointMarkersRef.current = [];

    // Las coordenadas GeoJSON son [lng, lat]
    const latLngs = autoRoute.coordinates.map(([lng, lat]) => [lat, lng]);
    coordsRef.current = latLngs;

    polylineRef.current?.setLatLngs(latLngs);

    // Puntos de vértice
    latLngs.forEach(([lat, lng]) => {
      const marker = L.marker([lat, lng], {icon: pointIcon}).addTo(map);
      pointMarkersRef.current.push(marker);
    });

    setHasRoute(true);
    onRouteChange?.(autoRoute);

    // Ajustar vista a la ruta
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
      <div className="flex items-center justify-between text-xs text-gray-500">
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
      <div
        ref={containerRef}
        style={{height: 420}}
        className="rounded-xl overflow-hidden border border-gray-200"
      />
      {!hasRoute && (
        <p className="text-xs text-amber font-medium text-center">
          Usa "Mejor ruta disponible" o traza la ruta manualmente en el mapa.
        </p>
      )}
      {hasRoute && (
        <p className="text-xs text-teal font-medium text-center">
          Ruta lista. Puedes continuar con la aprobación.
        </p>
      )}
    </div>
  );
}
