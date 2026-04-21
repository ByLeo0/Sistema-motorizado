/**
 * Página completa de aprobación de un servicio.
 * - Selección del motorizado
 * - Opción de "mejor ruta disponible" (Mapbox Directions API)
 * - Opción de trazar ruta manualmente
 * - Tolerancia de desvío
 * - Botón de confirmar aprobación
 */
import {useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {servicesAPI, usersAPI} from '../services/api';
import {Button, Spinner} from '../components/ui';
import RouteDrawer from '../components/map/RouteDrawer';
import toast from 'react-hot-toast';
import {format} from 'date-fns';
import {es} from 'date-fns/locale';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export default function ApproveServicePage() {
  const {id}     = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

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

  // ── Calcular mejor ruta con Mapbox Directions API ─────────────────────────
  const fetchBestRoute = async () => {
    if (!origin || !destination) return;
    if (!MAPBOX_TOKEN) {
      toast.error('Configura VITE_MAPBOX_TOKEN en el archivo .env del admin.');
      return;
    }
    setLoadingRoute(true);
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/` +
        `${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
        `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

      const res  = await fetch(url);
      const data = await res.json();

      if (data.routes?.[0]?.geometry) {
        setAutoRoute(data.routes[0].geometry);
        toast.success('Mejor ruta calculada correctamente.');
      } else {
        toast.error('No se pudo calcular la ruta. Verifica las coordenadas.');
      }
    } catch {
      toast.error('Error al contactar Mapbox. Verifica tu token.');
    } finally {
      setLoadingRoute(false);
    }
  };

  // ── Confirmar aprobación ───────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!motoId)       { toast.error('Selecciona un motorizado.');   return; }
    if (!routeGeoJSON) { toast.error('Define la ruta del servicio.'); return; }

    setSaving(true);
    try {
      await servicesAPI.approve(id, {
        motorizado_id:    motoId,
        route_geometry:   routeGeoJSON,
        tolerance_meters: tolerance,
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
  if (!service)  return <div className="p-6 text-gray-400">Servicio no encontrado.</div>;

  if (service.status !== 'pending') {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <p className="text-gray-500 mb-4">Este servicio ya no está pendiente de aprobación.</p>
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
          className="text-gray-400 hover:text-gray-700 transition text-sm flex items-center gap-1">
          ← Volver
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Aprobar servicio #{id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-sm text-gray-400">
            Creado el {format(new Date(service.created_at), "d 'de' MMMM yyyy, HH:mm", {locale: es})}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Panel izquierdo ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* Resumen del servicio */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Resumen del servicio</h2>
            <InfoRow label="Solicitante" value={service.requester?.full_name || '—'} />
            <InfoRow label="Origen"
              value={`${service.origin_lat?.toFixed(5)}, ${service.origin_lng?.toFixed(5)}`} />
            <InfoRow label="Destino"
              value={`${service.destination_lat?.toFixed(5)}, ${service.destination_lng?.toFixed(5)}`} />
            {service.notes && <InfoRow label="Notas" value={service.notes} />}
          </section>

          {/* Selección de motorizado */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Asignar motorizado</h2>
            <select
              value={motoId}
              onChange={e => setMotoId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="">Seleccionar motorizado...</option>
              {(motorizados || []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name} — {m.phone || m.email}
                </option>
              ))}
            </select>
            {motoSelected && (
              <div className="mt-3 flex items-center gap-3 bg-brand/5 rounded-xl px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <span className="text-brand text-xs font-bold">
                    {motoSelected.first_name?.[0]}{motoSelected.last_name?.[0]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{motoSelected.full_name}</p>
                  <p className="text-xs text-gray-400">{motoSelected.phone || motoSelected.email}</p>
                </div>
              </div>
            )}
          </section>

          {/* Tolerancia de desvío */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">
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
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>20 m — estricto</span>
              <span>500 m — flexible</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Si el motorizado se aleja más de {tolerance} m de la ruta, se genera una incidencia automáticamente.
            </p>
          </section>

          {/* Botón confirmar */}
          <Button
            variant="success"
            onClick={handleApprove}
            disabled={saving || !motoId || !routeGeoJSON}>
            {saving ? 'Aprobando...' : 'Confirmar aprobación'}
          </Button>

          {(!motoId || !routeGeoJSON) && (
            <p className="text-xs text-gray-400 text-center -mt-2">
              {!motoId ? 'Falta seleccionar motorizado.' : ''}
              {!routeGeoJSON ? ' Falta definir la ruta.' : ''}
            </p>
          )}
        </div>

        {/* ── Panel derecho — Mapa ────────────────────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Opciones de ruta */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3">Ruta del servicio</h2>

            <div className="flex flex-wrap gap-3 mb-4">
              <Button
                variant="primary"
                onClick={fetchBestRoute}
                disabled={loadingRoute}>
                {loadingRoute ? 'Calculando...' : '✦ Mejor ruta disponible'}
              </Button>
              <button
                onClick={() => { setAutoRoute(null); setRouteGeoJSON(null); }}
                className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:border-brand hover:text-brand transition">
                Trazar manualmente
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-3">
              <strong>Mejor ruta disponible</strong>: calcula automáticamente la ruta óptima por carretera entre origen y destino usando Mapbox Directions.
              <br />
              <strong>Trazar manualmente</strong>: haz clic en el mapa para dibujar una ruta personalizada.
            </p>

            <RouteDrawer
              origin={origin}
              destination={destination}
              onRouteChange={setRouteGeoJSON}
              autoRoute={autoRoute}
            />
          </div>
        </div>

      </div>
    </div>
  );
}

function InfoRow({label, value}) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0 gap-4">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}
