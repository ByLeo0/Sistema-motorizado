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

  const {data: service, isLoading} = useQuery({
    queryKey: ['service', id],
    queryFn:  () => servicesAPI.detail(id).then(r => r.data),
  });

  // ── Rechazar ───────────────────────────────────────────────────────────────
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

  if (isLoading) return <div className="flex justify-center py-24"><Spinner /></div>;
  if (!service)  return <div className="p-6 text-gray-400">Servicio no encontrado.</div>;

  const isPending = service.status === 'pending';
  const isTransit = service.status === 'in_transit';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Servicio #${id.slice(-8).toUpperCase()}`}
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

          <Card title="Coordenadas">
            <Row label="Origen"  value={`${service.origin_lat?.toFixed(6)}, ${service.origin_lng?.toFixed(6)}`} />
            <Row label="Destino" value={`${service.destination_lat?.toFixed(6)}, ${service.destination_lng?.toFixed(6)}`} />
            {service.route && (
              <Row label="Tolerancia" value={`${service.route.tolerance_meters} m`} />
            )}
          </Card>

          {/* Documentos */}
          {service.documents?.length > 0 && (
            <Card title={`Documentos (${service.documents.length})`}>
              {service.documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700">{_docLabel(doc.doc_type)}</span>
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
              <p className="text-sm text-gray-400 py-4 text-center">Sin incidencias.</p>
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
            <div className="bg-amber/5 border border-amber/20 rounded-2xl p-4 text-center">
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

      {/* ── Modal Rechazar ─────────────────────────────────────────────────── */}
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Motivo del rechazo (se notificará al cliente)
          </label>
          <textarea
            rows={4}
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder="Ej: La zona de destino está fuera de nuestra cobertura..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-coral/30 focus:border-coral resize-none"
          />
        </div>
      </Modal>
    </div>
  );
}

function Card({title, children}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>
      <div className="px-5 py-3">{children}</div>
    </div>
  );
}

function Row({label, value}) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0 gap-4">
      <span className="text-sm text-gray-400 shrink-0">{label}</span>
      <span className="text-sm text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}

function _docLabel(type) {
  return {delivery_note: 'Guía de remisión', invoice: 'Factura', receipt: 'Recibo', other: 'Otro'}[type] || type;
}
