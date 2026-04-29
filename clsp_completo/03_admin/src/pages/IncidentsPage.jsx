import React, {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {incidentsAPI, usersAPI} from '../services/api';
import {PageHeader, Spinner, Button, Modal} from '../components/ui';
import toast from 'react-hot-toast';
import {formatDistanceToNow, format} from 'date-fns';
import {es} from 'date-fns/locale';
import clsx from 'clsx';

const TYPE_MAP = {
  deviation: {label: 'Desvío de ruta',        color: 'text-coral bg-coral/10'},
  stop:      {label: 'Detención prolongada',   color: 'text-amber bg-amber/10'},
  speed:     {label: 'Velocidad excesiva',     color: 'text-red-600 bg-red-50'},
  manual:    {label: 'Reporte manual',         color: 'text-gray-600 bg-gray-100'},
  accident:  {label: 'Accidente',              color: 'text-red-700 bg-red-50'},
  breakdown: {label: 'Avería del vehículo',    color: 'text-amber bg-amber/10'},
  traffic:   {label: 'Tráfico / Congestión',   color: 'text-brand bg-brand/10'},
};

const ACTION_OPTS = [
  {value: 'resolve',  label: 'Marcar como resuelta'},
  {value: 'reassign', label: 'Reasignar a otro motorizado'},
  {value: 'cancel',   label: 'Cancelar el servicio'},
];

export default function IncidentsPage() {
  const [searchParams] = useSearchParams();
  const serviceFilter  = searchParams.get('service') || '';
  const qc             = useQueryClient();

  const [selected,   setSelected]   = useState(null);
  const [action,     setAction]     = useState('resolve');
  const [comment,    setComment]    = useState('');
  const [motoId,     setMotoId]     = useState('');
  const [saving,     setSaving]     = useState(false);

  const {data, isLoading, refetch} = useQuery({
    queryKey: ['incidents', serviceFilter],
    queryFn:  () => incidentsAPI.list({
      service:  serviceFilter || undefined,
      ordering: '-created_at',
    }).then(r => r.data),
    refetchInterval: 15_000,
  });

  const {data: motosData} = useQuery({
    queryKey: ['motorizados'],
    queryFn:  () => usersAPI.motorizados().then(r => r.data),
  });

  const incidents  = data?.results || data || [];
  const motorizados = motosData || [];

  const openModal = inc => {
    setSelected(inc);
    setAction('resolve');
    setComment('');
    setMotoId(motorizados[0]?.id || '');
  };

  const handleSubmit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      if (action === 'resolve') {
        await incidentsAPI.resolve(selected.id, {admin_comment: comment});
        toast.success('Incidencia resuelta.');
      } else if (action === 'reassign') {
        if (!motoId) { toast.error('Selecciona un motorizado.'); setSaving(false); return; }
        await incidentsAPI.reassign(selected.id, {motorizado_id: motoId, admin_comment: comment});
        toast.success('Servicio reasignado.');
      } else if (action === 'cancel') {
        await incidentsAPI.cancelService(selected.id, {admin_comment: comment});
        toast.success('Servicio cancelado.');
      }
      qc.invalidateQueries(['incidents']);
      setSelected(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo completar la acción.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Incidencias"
        subtitle={`${incidents.length} registros`}
        actions={
          <button onClick={() => refetch()} className="text-sm text-brand hover:underline px-3 py-2">
            Actualizar
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : incidents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center text-sm text-gray-400">
          Sin incidencias registradas.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left">
                <th className="px-5 py-3">Tipo</th>
                <th className="px-5 py-3">Descripción</th>
                <th className="px-5 py-3">Servicio</th>
                <th className="px-5 py-3">Respuesta admin</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Hace</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {incidents.map(inc => {
                const cfg = TYPE_MAP[inc.type] || TYPE_MAP.manual;
                return (
                  <tr key={inc.id} className={clsx('transition', inc.resolved && 'opacity-60')}>
                    <td className="px-5 py-3.5">
                      <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold', cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 max-w-[180px] truncate">{inc.description}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                      #{inc.service_number ? String(inc.service_number).padStart(4,'0') : String(inc.service).slice(-6).toUpperCase()}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500 max-w-[180px]">
                      {inc.admin_comment
                        ? <span title={inc.admin_comment} className="truncate block max-w-[160px]">{inc.admin_comment}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {inc.resolved ? (
                        <div>
                          <span className="text-xs text-green-600 font-semibold block">Resuelta</span>
                          {inc.resolved_by_name && (
                            <span className="text-xs text-gray-400">por {inc.resolved_by_name}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-coral font-semibold">Abierta</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {formatDistanceToNow(new Date(inc.created_at), {locale: es, addSuffix: true})}
                    </td>
                    <td className="px-5 py-3.5">
                      {!inc.resolved && (
                        <Button size="sm" variant="primary" onClick={() => openModal(inc)}>
                          Gestionar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de gestión de incidencia */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Gestionar incidencia — ${TYPE_MAP[selected?.type]?.label || selected?.type}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Guardando...' : 'Confirmar acción'}
            </Button>
          </>
        }>
        {selected && (
          <div className="flex flex-col gap-4">
            {/* Info incidencia */}
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">
                Servicio #{selected.service_number ? String(selected.service_number).padStart(4,'0') : '—'}
              </p>
              <p>{selected.description || 'Sin descripción.'}</p>
              <p className="text-xs text-gray-400 mt-1">
                {format(new Date(selected.created_at), "d MMM yyyy, HH:mm", {locale: es})}
              </p>
            </div>

            {/* Selector de acción */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Acción</label>
              <div className="flex flex-col gap-2">
                {ACTION_OPTS.map(opt => (
                  <label key={opt.value} className={clsx(
                    'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition',
                    action === opt.value
                      ? 'border-brand bg-brand/5'
                      : 'border-gray-200 hover:bg-gray-50',
                  )}>
                    <input
                      type="radio"
                      name="action"
                      value={opt.value}
                      checked={action === opt.value}
                      onChange={() => setAction(opt.value)}
                      className="accent-brand"
                    />
                    <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Selector de motorizado (solo para reasignar) */}
            {action === 'reassign' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nuevo motorizado</label>
                <select
                  value={motoId}
                  onChange={e => setMotoId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
                  {motorizados.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>
                  ))}
                  {motorizados.length === 0 && (
                    <option disabled>No hay motorizados activos</option>
                  )}
                </select>
              </div>
            )}

            {/* Comentario para el motorizado */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Comentario para el motorizado
                {action === 'resolve' && <span className="font-normal text-gray-400 ml-1">(opcional)</span>}
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                placeholder="Ej: Se resuelve por coordinación directa con el cliente..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
