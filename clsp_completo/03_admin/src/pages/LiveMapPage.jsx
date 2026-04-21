import {useState, useEffect} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {servicesAPI, trackingAPI} from '../services/api';
import {adminWS} from '../services/websocket';
import {useMapStore} from '../store';
import LiveTrackingMap from '../components/map/LiveTrackingMap';
import {StatusBadge, Spinner} from '../components/ui';
import toast from 'react-hot-toast';
import {formatDistanceToNow} from 'date-fns';
import {es} from 'date-fns/locale';
import clsx from 'clsx';

const fmtNum = n => n ? `#${String(n).padStart(4, '0')}` : '—';

export default function LiveMapPage() {
  const [searchParams]  = useSearchParams();
  const preselectedId   = searchParams.get('service');
  const [selectedId, setSelectedId] = useState(preselectedId || '');
  const [panelOpen,  setPanelOpen]  = useState(true);

  const {
    wsStatus, liveLocation, locationHistory,
    deviationAlerts, setWatchedService, setWsStatus,
    pushLocation, pushAlert, clearWatch,
  } = useMapStore();

  // Servicios activos (aprobados o en tránsito) para el selector
  const {data: inTransit, isLoading: loadingList} = useQuery({
    queryKey: ['services-transit'],
    queryFn: async () => {
      const [r1, r2] = await Promise.all([
        servicesAPI.list({status: 'in_transit', ordering: '-created_at'}),
        servicesAPI.list({status: 'approved',   ordering: '-created_at'}),
      ]);
      const list1 = r1.data?.results ?? r1.data ?? [];
      const list2 = r2.data?.results ?? r2.data ?? [];
      return [...list1, ...list2];
    },
    refetchInterval: 20_000,
  });

  // Posiciones activas de TODOS los motorizados (polling cada 10s)
  const {data: activeMotorizados} = useQuery({
    queryKey: ['tracking-active'],
    queryFn:  () => trackingAPI.active().then(r => r.data),
    refetchInterval: 10_000,
  });

  // Detalle del servicio seleccionado
  const {data: service} = useQuery({
    queryKey: ['service', selectedId],
    queryFn:  () => servicesAPI.detail(selectedId).then(r => r.data),
    enabled:  !!selectedId,
  });

  // Conectar WebSocket cuando cambia el servicio seleccionado
  useEffect(() => {
    adminWS.disconnect();
    clearWatch();
    if (!selectedId) return;

    setWatchedService(selectedId);

    adminWS.onStatus = s => {
      setWsStatus(s);
      if (s === 'connected')    toast.success('Conectado al canal de rastreo.');
      if (s === 'disconnected') toast('Reconectando...', {icon: '🔄'});
      if (s === 'error')        toast.error('Error de conexión WebSocket.');
    };

    adminWS.onUpdate = msg => {
      pushLocation({
        lat:              msg.lat,
        lng:              msg.lng,
        speed_kmh:        msg.speed_kmh,
        heading:          msg.heading,
        deviation_meters: msg.deviation_meters,
        is_deviated:      msg.is_deviated,
        motorizado_name:  msg.motorizado_name,
        timestamp:        msg.timestamp,
      });
    };

    adminWS.onDeviation = msg => {
      pushAlert(msg);
      toast.error(
        `⚠ Desvío: ${msg.motorizado_name} a ${msg.deviation_meters.toFixed(0)}m de la ruta`,
        {duration: 6000},
      );
    };

    adminWS.connect(selectedId);
    return () => { adminWS.disconnect(); clearWatch(); };
  }, [selectedId]);

  const services   = inTransit?.results || inTransit || [];
  const isDeviated = liveLocation?.is_deviated ?? false;

  const origin      = service ? {lat: service.origin_lat,      lng: service.origin_lng}      : null;
  const destination = service ? {lat: service.destination_lat, lng: service.destination_lng} : null;

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* ── MAPA — ocupa todo el espacio ─────────────────────────────── */}
      <div className="absolute inset-0">
        <LiveTrackingMap
          liveLocation={liveLocation}
          locationHistory={locationHistory}
          route={service?.route}
          origin={origin}
          destination={destination}
          isDeviated={isDeviated}
          allMotorizados={activeMotorizados || []}
          selectedServiceId={selectedId}
        />
      </div>

      {/* ── Botón abrir/cerrar panel ─────────────────────────────────── */}
      <button
        onClick={() => setPanelOpen(p => !p)}
        className="absolute top-4 left-4 z-[1100] bg-white shadow-lg rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition flex items-center gap-2">
        {panelOpen ? '← Ocultar' : '☰ Panel'}
      </button>

      {/* Badge servicio activo (siempre visible sobre el mapa) */}
      {service && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1100] bg-white/90 backdrop-blur-sm rounded-xl shadow px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-bold text-gray-800">{fmtNum(service.number)}</span>
          <StatusBadge status={service.status} />
          {wsStatus === 'connected' && (
            <span className="flex items-center gap-1.5 text-xs text-teal font-medium">
              <span className="w-2 h-2 rounded-full bg-teal animate-pulse" />
              En vivo
            </span>
          )}
        </div>
      )}

      {/* ── Panel lateral (overlay sobre el mapa) ───────────────────── */}
      <div className={clsx(
        'absolute top-0 left-0 h-full z-[1000] transition-transform duration-300',
        panelOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <aside className="w-72 h-full flex flex-col bg-white/95 backdrop-blur-sm border-r border-gray-100 shadow-xl overflow-y-auto pt-14">

          {/* Selector de servicio */}
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Seguir servicio
            </p>
            {loadingList ? (
              <div className="flex justify-center py-4"><Spinner className="w-5 h-5" /></div>
            ) : services.length === 0 ? (
              <p className="text-sm text-gray-400">No hay servicios en tránsito.</p>
            ) : (
              <>
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
                  <option value="">Ver todos en mapa</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {fmtNum(s.number)} — {s.motorizado_name || 'Sin asignar'}
                    </option>
                  ))}
                </select>
                {selectedId && (
                  <button
                    onClick={() => setSelectedId('')}
                    className="mt-2 text-xs text-gray-400 hover:text-coral w-full text-center">
                    Ver todos los motorizados
                  </button>
                )}
              </>
            )}
          </div>

          {/* Lista de motorizados activos cuando no hay servicio seleccionado */}
          {!selectedId && (activeMotorizados?.length ?? 0) > 0 && (
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Motorizados activos ({activeMotorizados.length})
              </p>
              <div className="flex flex-col gap-2">
                {activeMotorizados.map(m => (
                  <button
                    key={m.service_id}
                    onClick={() => setSelectedId(m.service_id)}
                    className={clsx(
                      'text-left rounded-xl border p-3 text-xs transition',
                      m.is_deviated
                        ? 'border-coral/30 bg-coral/5 hover:bg-coral/10'
                        : 'border-gray-100 bg-gray-50 hover:bg-gray-100',
                    )}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-gray-800">{m.motorizado_name}</span>
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded-full font-bold',
                        m.is_deviated ? 'bg-coral/20 text-coral' : 'bg-teal/20 text-teal',
                      )}>
                        {m.is_deviated ? '⚠ Desvío' : '● En ruta'}
                      </span>
                    </div>
                    <div className="text-gray-400 flex gap-3">
                      <span>{fmtNum(m.service_number)}</span>
                      {m.speed_kmh != null && <span>{m.speed_kmh.toFixed(0)} km/h</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Estado WebSocket */}
          {selectedId && (
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'w-2.5 h-2.5 rounded-full shrink-0',
                  wsStatus === 'connected'    && 'bg-teal animate-pulse',
                  wsStatus === 'disconnected' && 'bg-amber',
                  wsStatus === 'error'        && 'bg-coral',
                  wsStatus === 'idle'         && 'bg-gray-300',
                )} />
                <span className="text-xs text-gray-500">
                  {wsStatus === 'connected'    && 'WebSocket activo'}
                  {wsStatus === 'disconnected' && 'Reconectando...'}
                  {wsStatus === 'error'        && 'Error de conexión'}
                  {wsStatus === 'idle'         && 'Sin conexión'}
                </span>
              </div>
            </div>
          )}

          {/* Telemetría del motorizado seleccionado */}
          {liveLocation && (
            <div className={clsx(
              'mx-4 mt-4 rounded-xl p-3 text-xs',
              isDeviated ? 'bg-coral/10 border border-coral/30' : 'bg-teal/10 border border-teal/30',
            )}>
              <p className={clsx('font-bold text-sm mb-2', isDeviated ? 'text-coral' : 'text-teal')}>
                {isDeviated ? '⚠ Fuera de ruta' : '● En ruta'}
              </p>
              <TelRow label="Motorizado" value={liveLocation.motorizado_name} />
              <TelRow label="Velocidad"  value={`${liveLocation.speed_kmh?.toFixed(1)} km/h`} />
              <TelRow label="Desvío"     value={`${liveLocation.deviation_meters?.toFixed(0)} m`} highlight={isDeviated} />
              <TelRow label="Última pos." value={
                formatDistanceToNow(new Date(liveLocation.timestamp), {locale: es, addSuffix: true})
              } />
            </div>
          )}

          {/* Alertas de desvío */}
          {deviationAlerts.length > 0 && (
            <div className="p-4 flex-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Alertas ({deviationAlerts.length})
              </p>
              <div className="flex flex-col gap-2">
                {deviationAlerts.map((a, i) => (
                  <div key={i} className="bg-coral/5 border border-coral/20 rounded-lg p-2.5">
                    <p className="text-xs font-semibold text-coral">
                      {a.deviation_meters?.toFixed(0)} m fuera de ruta
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDistanceToNow(new Date(a.timestamp), {locale: es, addSuffix: true})}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function TelRow({label, value, highlight}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className={clsx('font-semibold', highlight ? 'text-coral' : 'text-gray-800')}>{value}</span>
    </div>
  );
}
