import {useState, useEffect} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {servicesAPI} from '../services/api';
import {StatusBadge, PageHeader, Spinner, Button, Modal} from '../components/ui';
import LocationPickerMap from '../components/map/LocationPickerMap';
import {formatDistanceToNow} from 'date-fns';
import {es} from 'date-fns/locale';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const STATUSES = [
  {value: '',           label: 'Todos'},
  {value: 'pending',    label: 'Pendientes'},
  {value: 'approved',   label: 'Aprobados'},
  {value: 'in_transit', label: 'En tránsito'},
  {value: 'completed',  label: 'Completados'},
  {value: 'rejected',   label: 'Rechazados'},
];

// Número formateado: #0001
const fmtNum = n => n ? `#${String(n).padStart(4, '0')}` : '—';

export default function ServicesPage() {
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') || '';

  const [createOpen, setCreateOpen] = useState(false);
  const [locations,  setLocations]  = useState({origin: null, destination: null});
  const [notes,      setNotes]      = useState('');
  const [saving,     setSaving]     = useState(false);

  // Abrir modal automáticamente si viene ?create=1 (desde Dashboard)
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateOpen(true);
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('create');
        return next;
      });
    }
  }, []);

  const {data, isLoading, refetch} = useQuery({
    queryKey: ['services', statusFilter],
    queryFn:  () => servicesAPI.list({
      status:   statusFilter || undefined,
      ordering: '-created_at',
    }).then(r => r.data),
    refetchInterval: 20_000,
  });

  const services = data?.results || data || [];

  const handleCreate = async e => {
    e?.preventDefault();
    const {origin, destination} = locations;
    if (!origin)      { toast.error('Marca el punto de origen en el mapa.');   return; }
    if (!destination) { toast.error('Marca el punto de destino en el mapa.'); return; }

    setSaving(true);
    try {
      await servicesAPI.create({
        origin_lat:      origin.lat,
        origin_lng:      origin.lng,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        notes,
      });
      toast.success('Servicio creado correctamente.');
      qc.invalidateQueries(['services']);
      setCreateOpen(false);
      setLocations({origin: null, destination: null});
      setNotes('');
    } catch (err) {
      const errors = err.response?.data;
      toast.error(errors ? Object.values(errors).flat().join(' ') : 'Error al crear el servicio.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Servicios"
        subtitle={`${data?.count ?? services.length} servicios encontrados`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="text-sm text-brand hover:underline px-3 py-2">
              Actualizar
            </button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              + Nuevo servicio
            </Button>
          </div>
        }
      />

      {/* Filtros de estado */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setSearchParams(s.value ? {status: s.value} : {})}
            className={clsx(
              'px-4 py-1.5 rounded-full text-sm font-medium transition',
              statusFilter === s.value
                ? 'bg-brand text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200 hover:border-brand hover:text-brand',
            )}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400 text-sm">
          No hay servicios con este filtro.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-5 py-3">N°</th>
                <th className="px-5 py-3">Solicitante</th>
                <th className="px-5 py-3">Motorizado</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Incidencias</th>
                <th className="px-5 py-3">Creado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {services.map(s => (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/services/${s.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition">
                  <td className="px-5 py-3.5 font-mono font-bold text-brand">
                    {fmtNum(s.number)}
                  </td>
                  <td className="px-5 py-3.5 text-gray-600">{s.requester_name || '—'}</td>
                  <td className="px-5 py-3.5 text-gray-600">{s.motorizado_name || '—'}</td>
                  <td className="px-5 py-3.5"><StatusBadge status={s.status} /></td>
                  <td className="px-5 py-3.5">
                    {s.incidents_count > 0 ? (
                      <span className="inline-flex items-center gap-1 text-coral font-semibold">
                        ⚑ {s.incidents_count}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">
                    {formatDistanceToNow(new Date(s.created_at), {locale: es, addSuffix: true})}
                  </td>
                  <td className="px-5 py-3.5 text-brand text-xs font-medium">Ver →</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Crear servicio */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setLocations({origin: null, destination: null}); setNotes(''); }}
        title="Crear nuevo servicio"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={saving || !locations.origin || !locations.destination}>
              {saving ? 'Creando...' : 'Crear servicio'}
            </Button>
          </>
        }>
        <div className="flex flex-col gap-4">
          <LocationPickerMap onChange={setLocations} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Notas (opcional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Instrucciones especiales, referencias, etc."
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
