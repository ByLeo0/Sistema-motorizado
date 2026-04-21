/**
 * Mapa en vivo con Leaflet + OpenStreetMap.
 * - Sin selección: marcadores de todos los motorizados activos.
 * - Con servicio seleccionado: ruta del motorizado + trayectoria GPS en tiempo real.
 */
import {useRef, useEffect} from 'react';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const motoIcon = (color = '#534AB7', deviated = false) => L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;position:relative">
    <div style="position:absolute;inset:0;border-radius:50%;background:${deviated ? '#D85A30' : color};opacity:0.2"></div>
    <div style="position:absolute;inset:5px;border-radius:50%;background:${deviated ? '#D85A30' : color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>
    ${deviated ? `<div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%);font-size:11px">⚠</div>` : ''}
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const makePin = (color, label) => L.divIcon({
  className: '',
  html: `<div style="position:relative;width:30px;height:38px">
    <div style="width:30px;height:30px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2.5px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.3)"></div>
    <span style="position:absolute;top:4px;left:0;width:30px;text-align:center;color:#fff;font-size:12px;font-weight:800">${label}</span>
  </div>`,
  iconSize: [30, 38],
  iconAnchor: [15, 36],
});

const originPin = makePin('#1D9E75', 'A');
const destPin   = makePin('#D85A30', 'B');

export default function LiveTrackingMap({
  liveLocation,
  locationHistory,
  route,
  origin,
  destination,
  isDeviated,
  allMotorizados = [],
  selectedServiceId,
}) {
  const containerRef     = useRef(null);
  const mapRef           = useRef(null);
  const motoMarkerRef    = useRef(null);
  const pathLayerRef     = useRef(null);
  const routeLayerRef    = useRef(null);
  const originMarkerRef  = useRef(null);
  const destMarkerRef    = useRef(null);
  const allMarkersRef    = useRef({});

  // ── Init map ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-12.0464, -77.0428],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Trayectoria real (punteada)
    pathLayerRef.current = L.polyline([], {
      color: '#534AB7', weight: 3, opacity: 0.8, dashArray: '7 5',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = motoMarkerRef.current = pathLayerRef.current = null;
      routeLayerRef.current = originMarkerRef.current = destMarkerRef.current = null;
      allMarkersRef.current = {};
    };
  }, []);

  // ── Ruta + origen/destino (se actualizan cuando cambia el servicio seleccionado) ─
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Limpiar ruta anterior
    if (routeLayerRef.current) { routeLayerRef.current.remove(); routeLayerRef.current = null; }

    // Limpiar marcadores origen/destino anteriores
    if (originMarkerRef.current) { originMarkerRef.current.remove(); originMarkerRef.current = null; }
    if (destMarkerRef.current)   { destMarkerRef.current.remove();   destMarkerRef.current   = null; }

    // Limpiar marcador motorizado seleccionado
    if (motoMarkerRef.current) { motoMarkerRef.current.remove(); motoMarkerRef.current = null; }

    if (!selectedServiceId) return;

    // Ruta fija del servicio
    if (route?.geometry?.coordinates?.length > 1) {
      const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      routeLayerRef.current = L.polyline(coords, {
        color: '#1D9E75', weight: 5, opacity: 0.7,
      }).addTo(map);
    }

    // Marcadores origen / destino
    if (origin?.lat && origin?.lng) {
      originMarkerRef.current = L.marker([origin.lat, origin.lng], {icon: originPin})
        .bindPopup('<strong style="color:#1D9E75">Origen (A)</strong>')
        .addTo(map);
    }
    if (destination?.lat && destination?.lng) {
      destMarkerRef.current = L.marker([destination.lat, destination.lng], {icon: destPin})
        .bindPopup('<strong style="color:#D85A30">Destino (B)</strong>')
        .addTo(map);
    }

    // Marcador motorizado (se actualizará con liveLocation)
    const startLat = origin?.lat ?? -12.0464;
    const startLng = origin?.lng ?? -77.0428;
    motoMarkerRef.current = L.marker([startLat, startLng], {icon: motoIcon('#534AB7', false)})
      .bindPopup('Motorizado')
      .addTo(map);

    // Ajustar vista al área de la ruta
    const bounds = [];
    if (origin?.lat)      bounds.push([origin.lat, origin.lng]);
    if (destination?.lat) bounds.push([destination.lat, destination.lng]);
    if (routeLayerRef.current) {
      routeLayerRef.current.getBounds().isValid() && bounds.push(
        ...routeLayerRef.current.getLatLngs()
      );
    }
    if (bounds.length >= 2) {
      map.fitBounds(bounds.slice(0, 2).concat(bounds.slice(-1)), {padding: [60, 60], maxZoom: 15});
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }

  }, [selectedServiceId, route, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  // ── Mover marcador WebSocket ─────────────────────────────────────────────────
  useEffect(() => {
    if (!liveLocation || !motoMarkerRef.current) return;
    const {lat, lng, motorizado_name, speed_kmh, deviation_meters} = liveLocation;
    motoMarkerRef.current.setLatLng([lat, lng]);
    motoMarkerRef.current.setIcon(motoIcon('#534AB7', isDeviated));
    motoMarkerRef.current.setPopupContent(`
      <div style="font-size:12px;line-height:1.8">
        <strong>${motorizado_name ?? 'Motorizado'}</strong><br/>
        ${isDeviated
          ? `<span style="color:#D85A30;font-weight:600">⚠ Fuera de ruta · ${deviation_meters?.toFixed(0)}m</span>`
          : `<span style="color:#1D9E75;font-weight:600">● En ruta</span>`}
        ${speed_kmh != null ? `<br/><span style="color:#666">${speed_kmh.toFixed(0)} km/h</span>` : ''}
      </div>`);
    mapRef.current?.panTo([lat, lng], {animate: true, duration: 0.8});
  }, [liveLocation, isDeviated]);

  // ── Actualizar trayectoria recorrida ─────────────────────────────────────────
  useEffect(() => {
    if (!pathLayerRef.current || !locationHistory?.length) return;
    pathLayerRef.current.setLatLngs(locationHistory.map(p => [p.lat, p.lng]));
  }, [locationHistory]);

  // ── Marcadores de todos los motorizados (sin selección) ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(allMotorizados.map(m => m.service_id));

    for (const [id, marker] of Object.entries(allMarkersRef.current)) {
      if (!currentIds.has(id)) { marker.remove(); delete allMarkersRef.current[id]; }
    }

    const withPos = [];
    allMotorizados.forEach(m => {
      if (!m.lat || !m.lng) return;
      if (selectedServiceId && m.service_id === selectedServiceId) return;

      withPos.push(m);

      const popup = `
        <div style="font-size:12px;line-height:1.8">
          <strong>${m.motorizado_name}</strong><br/>
          ${m.is_deviated
            ? '<span style="color:#D85A30;font-weight:600">⚠ Fuera de ruta</span>'
            : '<span style="color:#1D9E75;font-weight:600">● En ruta</span>'}
          ${m.speed_kmh != null ? `<br/>${m.speed_kmh.toFixed(0)} km/h` : ''}
          <br/><span style="color:#999">Servicio #${String(m.service_number).padStart(4,'0')}</span>
        </div>`;

      if (allMarkersRef.current[m.service_id]) {
        allMarkersRef.current[m.service_id]
          .setLatLng([m.lat, m.lng])
          .setIcon(motoIcon(m.is_deviated ? '#D85A30' : '#1D9E75', m.is_deviated))
          .setPopupContent(popup);
      } else {
        allMarkersRef.current[m.service_id] = L.marker(
          [m.lat, m.lng],
          {icon: motoIcon(m.is_deviated ? '#D85A30' : '#1D9E75', m.is_deviated)},
        ).bindPopup(popup).addTo(map);
      }
    });

    if (!selectedServiceId && withPos.length > 0) {
      withPos.length === 1
        ? map.setView([withPos[0].lat, withPos[0].lng], 14)
        : map.fitBounds(withPos.map(m => [m.lat, m.lng]), {padding: [60, 60], maxZoom: 14});
    }
  }, [allMotorizados, selectedServiceId]);

  return <div ref={containerRef} className="w-full h-full" style={{minHeight: '400px'}} />;
}
