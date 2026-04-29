import {useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {servicesAPI, usersAPI} from '../services/api';
import {Button, Spinner} from '../components/ui';
import RouteDrawer from '../components/map/RouteDrawer';
import toast from 'react-hot-toast';
import {format} from 'date-fns';
import {es} from 'date-fns/locale';

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export default function ApproveServicePage() {
  const {id}     = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone,setCustomerPhone]= useState('');
  const [customerAddr, setCustomerAddr] = useState('');
  const [stops,          setStops]          = useState([]);
  const [newStopQuery,   setNewStopQuery]   = useState('');
  const [stopResults,    setStopResults]    = useState([]);
  const [searchingStop,  setSearchingStop]  = useState(false);
  const [showStopDrop,   setShowStopDrop]   = useState(false);
  const [motoId,       setMotoId]       = useState('');
  const [tolerance,    setTolerance]    = useState(100);
  const [routeGeoJSON, setRouteGeoJSON] = useState(null);
  const [autoRoute,    setAutoRoute]    = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [saving,       setSaving]       = useState(false);

  const {data: service, isLoading} = useQuery({
    queryKey: ['service', id],
    queryFn:  () => servicesAPI.detail(id).then(r => r.data),
  });

  const {data: motorizados} = useQuery({
    queryKey: ['motorizados'],
    queryFn:  () => usersAPI.motorizados().then(r => r.data),
  });

  const origin      = service ? {lat: service.origin_lat,      lng: service.origin_lng}      : null;
  const destination = service ? {lat: service.destination_lat, lng: service.destination_lng} : null;

  // Geocodificación de paradas con Nominatim (OSM, sin clave API)
  const searchStop = async (e) => {
    e?.preventDefault();
    if (!newStopQuery.trim()) return;
    setSearchingStop(true);
    setShowStopDrop(false);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(newStopQuery)}&format=json&limit=5&countrycodes=pe`;
      const res  = await fetch(url, {headers: {'Accept-Language': 'es'}});
      const data = await res.json();
      setStopResults(data);
      setShowStopDrop(true);
    } catch {
      toast.error('Error al buscar la dirección.');
    } finally {
      setSearchingStop(false);
    }
  };

  const selectStopResult = (r) => {
    const label = r.display_name.split(',').slice(0, 3).join(',').trim();
    setStops(prev => [...prev, {lat: parseFloat(r.lat), lng: parseFloat(r.lon), description: label}]);
    setNewStopQuery('');
    setStopResults([]);
    setShowStopDrop(false);
    toast.success('Parada agregada.');
  };

  const removeStop = (idx) => setStops(stops.filter((_, i) => i !== idx));

  const fetchBestRoute = async () => {
    if (!origin || !destination) return;
    setLoadingRoute(true);
    try {
      // Construir waypoints OSRM: origen → paradas intermedias → destino
      const coords = [
        `${origin.lng},${origin.lat}`,
        ...stops.map(s => `${s.lng},${s.lat}`),
        `${destination.lng},${destination.lat}`,
      ].join(';');

      const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson`;
      const res  = await fetch(url);
      const data = await res.json();

      if (data.routes?.[0]?.geometry) {
        setAutoRoute(data.routes[0].geometry);
        const msg = stops.length > 0
          ? `Ruta calculada con ${stops.length} parada${stops.length > 1 ? 's' : ''} intermedia${stops.length > 1 ? 's' : ''}.`
          : 'Mejor ruta calculada correctamente.';
        toast.success(msg);
      } else {
        toast.error('No se pudo calcular la ruta. Verifica las coordenadas.');
      }
    } catch {
      toast.error('Error al calcular la ruta. Verifica tu conexión.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleApprove = async () => {
    if (!motoId)       { toast.error('Selecciona un motorizado.');   return; }
    if (!routeGeoJSON) { toast.error('Define la ruta del servicio.'); return; }
    if (!customerName.trim()) { toast.error('Ingresa nombre del cliente.'); return; }

    setSaving(true);
    try {
      await servicesAPI.approve(id, {
        motorizado_id:    motoId,
        route_geometry:   routeGeoJSON,
        tolerance_meters: tolerance,
        customer_name:    customerName,
        customer_phone:   customerPhone,
        customer_address: customerAddr,
        stops: stops.length > 0 ? stops : undefined,
      });
      toast.success('Servicio aprobado. El motorizado fue notificado.');
      qc.invalidateQueries(['service', id]);
      qc.invalidateQueries(['services']);
      qc.invalidateQueries(['dashboard']);
      navigate(`/services/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al aprobar el servicio.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!service)  return <div className="p-6 text-gray-400 dark:text-gray-500">Servicio no encontrado.</div>;

  if (service.status !== 'pending') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Este servicio ya no está pendiente de aprobación.</p>
        <Button variant="outline" onClick={() => navigate(`/services/${id}`)}>
          ← Volver al servicio
        </Button>
      </div>
    );
  }

  const motoSelected = (motorizados || []).find(m => m.id === motoId);

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Encabezado */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(`/services/${id}`)}
          className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition text-sm flex items-center gap-1">
          ← Volver
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Aprobar servicio #{id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Creado el {format(new Date(service.created_at), "d 'de' MMMM yyyy, HH:mm", {locale: es})}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Panel izquierdo ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Datos del cliente */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Datos del cliente</h2>
            <input
              type="text"
              placeholder="Nombre del cliente *"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <input
              type="text"
              placeholder="Dirección"
              value={customerAddr}
              onChange={e => setCustomerAddr(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </section>

          {/* Resumen del servicio */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Resumen del servicio</h2>
            <InfoRow label="Solicitante" value={service.requester?.full_name || '—'} />
            <InfoRow label="Origen"
              value={`${service.origin_lat?.toFixed(5)}, ${service.origin_lng?.toFixed(5)}`} />
            <InfoRow label="Destino"
              value={`${service.destination_lat?.toFixed(5)}, ${service.destination_lng?.toFixed(5)}`} />
            {service.notes && <InfoRow label="Notas" value={service.notes} />}
          </section>

          {/* Paradas intermedias — opcional */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">Paradas intermedias</h2>
              <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">opcional</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              Agrega ubicaciones de paso. Al calcular la mejor ruta se incluirán como waypoints.
            </p>

            {/* Buscador de dirección */}
            <div className="relative mb-2">
              <form onSubmit={searchStop} className="flex gap-2">
                <input
                  type="text"
                  value={newStopQuery}
                  onChange={e => { setNewStopQuery(e.target.value); if (!e.target.value) setShowStopDrop(false); }}
                  placeholder="Buscar dirección de parada..."
                  className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
                <button
                  type="submit"
                  disabled={searchingStop}
                  className="px-3 py-1.5 bg-teal text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition shrink-0">
                  {searchingStop ? '…' : 'Buscar'}
                </button>
              </form>

              {/* Resultados */}
              {showStopDrop && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-[2000] max-h-44 overflow-y-auto">
                  {stopResults.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-gray-400">Sin resultados. Intenta otra dirección.</p>
                  ) : (
                    stopResults.map((r, i) => (
                      <button
                        key={i}
                        onClick={() => selectStopResult(r)}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-50 dark:border-gray-700 last:border-0 transition">
                        <p className="font-medium text-gray-800 dark:text-gray-100 truncate">
                          {r.display_name.split(',').slice(0, 2).join(',')}
                        </p>
                        <p className="text-gray-400 dark:text-gray-500 truncate">
                          {r.display_name.split(',').slice(2, 4).join(',')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Lista de paradas agregadas */}
            {stops.length > 0 ? (
              <div className="space-y-1 mt-2">
                {stops.map((s, i) => (
                  <div key={i} className="flex items-center justify-between bg-teal/5 dark:bg-teal/10 border border-teal/20 dark:border-teal/30 rounded-lg px-3 py-2 text-xs gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-teal text-white flex items-center justify-center shrink-0 font-bold text-[10px]">
                        {i + 1}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300 truncate">{s.description}</span>
                    </div>
                    <button
                      onClick={() => removeStop(i)}
                      className="text-coral hover:opacity-70 transition shrink-0">
                      ✕
                    </button>
                  </div>
                ))}
                <p className="text-xs text-teal dark:text-teal-400 mt-2">
                  ✓ {stops.length} parada{stops.length > 1 ? 's' : ''} — se incluirá{stops.length > 1 ? 'n' : ''} en la ruta automática.
                </p>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2 italic">
                Sin paradas — ruta directa de origen a destino.
              </p>
            )}
          </section>

          {/* Selección de motorizado */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Asignar motorizado</h2>
            <select
              value={motoId}
              onChange={e => setMotoId(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="">Seleccionar motorizado...</option>
              {(motorizados || []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name} — {m.phone || m.email}
                </option>
              ))}
            </select>
            {motoSelected && (
              <div className="mt-3 flex items-center gap-3 bg-brand/5 dark:bg-brand/10 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center shrink-0">
                  <span className="text-brand text-xs font-bold">
                    {motoSelected.first_name?.[0]}{motoSelected.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{motoSelected.full_name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{motoSelected.phone || motoSelected.email}</p>
                </div>
              </div>
            )}
          </section>

          {/* Tolerancia de desvío */}
          <section className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">
              Tolerancia de desvío:{' '}
              <span className="text-brand font-bold">{tolerance} m</span>
            </h2>
            <input
              type="range"
              min="20" max="500" step="10"
              value={tolerance}
              onChange={e => setTolerance(Number(e.target.value))}
              className="w-full accent-brand"
            />
            <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
              <span>20 m — estricto</span>
              <span>500 m — flexible</span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Si el motorizado se aleja más de {tolerance} m de la ruta, se genera una incidencia automáticamente.
            </p>
          </section>

          {/* Botón confirmar */}
          <Button
            variant="success"
            onClick={handleApprove}
            disabled={saving || !motoId || !routeGeoJSON || !customerName.trim()}>
            {saving ? 'Aprobando...' : 'Confirmar aprobación'}
          </Button>

          {(!motoId || !routeGeoJSON || !customerName.trim()) && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center -mt-2">
              {!customerName.trim() ? 'Falta nombre del cliente. ' : ''}
              {!motoId ? 'Falta seleccionar motorizado. ' : ''}
              {!routeGeoJSON ? 'Falta definir la ruta.' : ''}
            </p>
          )}
        </div>

        {/* ── Panel derecho — Mapa ────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Opciones de ruta */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Ruta del servicio</h2>

            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                variant="primary"
                onClick={fetchBestRoute}
                disabled={loadingRoute}>
                {loadingRoute ? 'Calculando...' : '✦ Mejor ruta disponible'}
              </Button>
              <button
                onClick={() => { setAutoRoute(null); setRouteGeoJSON(null); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-brand hover:text-brand transition">
                Trazar manualmente
              </button>
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
              <strong>Mejor ruta disponible</strong>: calcula automáticamente la ruta óptima por carretera entre origen y destino usando OSRM (OpenStreetMap).
              <br />
              <strong>Trazar manualmente</strong>: haz clic en el mapa para dibujar una ruta personalizada.
            </p>

            <RouteDrawer
              origin={origin}
              destination={destination}
              onRouteChange={setRouteGeoJSON}
              autoRoute={autoRoute}
              stops={stops}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

function InfoRow({label, value}) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0 gap-4">
      <span className="text-sm text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 font-medium text-right">{value}</span>
    </div>
  );
}
