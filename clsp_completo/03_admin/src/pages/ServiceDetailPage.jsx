import {useState} from 'react';
import {useParams, useNavigate} from 'react-router-dom';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {servicesAPI} from '../services/api';
import {StatusBadge, Button, Modal, PageHeader, Spinner} from '../components/ui';
import toast from 'react-hot-toast';
import {format} from 'date-fns';
import {es} from 'date-fns/locale';

export default function ServiceDetailPage() {
  const {id}     = useParams();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [ratingHover,  setRatingHover]  = useState(0);

  const {data: service, isLoading} = useQuery({
    queryKey: ['service', id],
    queryFn:  () => servicesAPI.detail(id).then(r => r.data),
  });

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast.error('Escribe el motivo del rechazo.'); return; }
    setSaving(true);
    try {
      await servicesAPI.reject(id, {reason: rejectReason});
      toast.success('Servicio rechazado.');
      qc.invalidateQueries(['service', id]);
      setRejectOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al rechazar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRate = async (stars) => {
    try {
      await servicesAPI.rate(id, {rating: stars});
      qc.invalidateQueries(['service', id]);
      toast.success(`Puntuación ${stars}/5 guardada.`);
    } catch {
      toast.error('Error al guardar la puntuación.');
    }
  };

  if (isLoading) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!service)  return <div className="p-6 text-gray-400">Servicio no encontrado.</div>;

  const isPending   = service.status === 'pending';
  const isTransit   = service.status === 'in_transit';
  const isCompleted = service.status === 'completed';

  const stops     = service.stops || [];
  const hasCustomer = service.customer_name || service.customer_phone || service.customer_address;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Servicio #${String(service.number || '').padStart(4, '0')}`}
        subtitle={`Creado el ${format(new Date(service.created_at), "d 'de' MMMM yyyy, HH:mm", {locale: es})}`}
        actions={
          <div className="flex gap-2">
            {isTransit && (
              <Button variant="primary" onClick={() => navigate(`/live-map?service=${id}`)}>
                Ver en mapa en vivo
              </Button>
            )}
            {isPending && (
              <>
                <Button variant="success" onClick={() => navigate(`/services/${id}/approve`)}>
                  Aprobar
                </Button>
                <Button variant="danger" onClick={() => setRejectOpen(true)}>Rechazar</Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Info principal */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <Card title="Información general">
            <Row label="Estado"      value={<StatusBadge status={service.status} />} />
            <Row label="Solicitante" value={service.requester?.full_name || '—'} />
            <Row label="Motorizado"  value={service.assigned_motorizado?.full_name || 'No asignado'} />
            {service.approved_by && (
              <Row label="Aprobado por" value={service.approved_by.full_name} />
            )}
            {service.notes && <Row label="Notas" value={service.notes} />}
          </Card>

          {/* Destinatario */}
          {hasCustomer && (
            <Card title="Datos del destinatario">
              {service.customer_name    && <Row label="Nombre"    value={service.customer_name} />}
              {service.customer_phone   && <Row label="Teléfono"  value={service.customer_phone} />}
              {service.customer_address && <Row label="Dirección" value={service.customer_address} />}
            </Card>
          )}

          {/* Paradas intermedias */}
          {stops.length > 0 && (
            <Card title={`Paradas intermedias (${stops.length})`}>
              <div className="space-y-2 py-1">
                {stops.map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center shrink-0 text-xs font-bold mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{s.description || `${s.lat?.toFixed(5)}, ${s.lng?.toFixed(5)}`}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Coordenadas">
            <Row label="Origen"  value={`${service.origin_lat?.toFixed(6)}, ${service.origin_lng?.toFixed(6)}`} />
            <Row label="Destino" value={`${service.destination_lat?.toFixed(6)}, ${service.destination_lng?.toFixed(6)}`} />
            {service.route && (
              <Row label="Tolerancia" value={`${service.route.tolerance_meters} m`} />
            )}
          </Card>

          {/* Puntuación */}
          <Card title="Puntuación del servicio">
            <div className="py-2">
              {isCompleted || service.rating != null ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1"
                    onMouseLeave={() => setRatingHover(0)}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <button
                        key={star}
                        onMouseEnter={() => setRatingHover(star)}
                        onClick={() => handleRate(star)}
                        className={`text-3xl transition-transform hover:scale-110 leading-none ${
                          star <= (ratingHover || service.rating || 0)
                            ? 'text-amber'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}>
                        ★
                      </button>
                    ))}
                    {service.rating > 0 ? (
                      <span className="ml-2 text-sm font-bold text-gray-700 dark:text-gray-300 self-center">
                        {service.rating}/5
                      </span>
                    ) : (
                      <span className="ml-2 text-sm text-gray-400 dark:text-gray-500 self-center">Sin puntuación</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Haz clic en una estrella para asignar la puntuación.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
                  La puntuación estará disponible cuando el servicio se complete.
                </p>
              )}
            </div>
          </Card>

          {/* Documentos */}
          {service.documents?.length > 0 && (
            <Card title={`Documentos (${service.documents.length})`}>
              {service.documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{_docLabel(doc.doc_type)}</span>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:underline">
                    Ver PDF
                  </a>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Panel lateral */}
        <div className="flex flex-col gap-4">
          <Card title={`Incidencias (${service.incidents_count ?? 0})`}>
            {!service.incidents_count ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Sin incidencias.</p>
            ) : (
              <button
                onClick={() => navigate(`/incidents?service=${id}`)}
                className="w-full text-sm text-brand hover:underline py-2">
                Ver {service.incidents_count} incidencia{service.incidents_count !== 1 ? 's' : ''}
              </button>
            )}
          </Card>

          {service.route && (
            <Card title="Ruta asignada">
              <Row label="Tolerancia" value={`${service.route.tolerance_meters} m`} />
              <Row label="Puntos"     value={service.route.geometry?.coordinates?.length ?? '—'} />
            </Card>
          )}

          {isPending && (
            <div className="bg-amber/5 dark:bg-amber/10 border border-amber/20 dark:border-amber/30 rounded-2xl p-4 text-center">
              <p className="text-sm text-amber font-medium mb-3">Servicio pendiente de aprobación</p>
              <Button
                variant="success"
                onClick={() => navigate(`/services/${id}/approve`)}
                className="w-full">
                Ir a aprobar →
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Modal Rechazar */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Rechazar servicio"
        footer={
          <>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleReject} disabled={saving}>
              {saving ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
          </>
        }>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Motivo del rechazo (se notificará al cliente)
          </label>
          <textarea
            rows={4}
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Ej: La zona de destino está fuera de nuestra cobertura..."
            className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-coral/30 focus:border-coral resize-none"
          />
        </div>
      </Modal>
    </div>
  );
}

function Card({title, children}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

function Row({label, value}) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0 gap-4">
      <span className="text-sm text-gray-400 dark:text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 dark:text-gray-200 font-medium text-right">{value}</span>
    </div>
  );
}

function _docLabel(type) {
  return {delivery_note: 'Guía de remisión', invoice: 'Factura', receipt: 'Recibo', other: 'Otro'}[type] || type;
}
