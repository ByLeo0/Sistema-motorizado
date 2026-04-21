import React from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {incidentsAPI} from '../services/api';
import {PageHeader, Spinner, Button} from '../components/ui';
import toast from 'react-hot-toast';
import {formatDistanceToNow} from 'date-fns';
import {es} from 'date-fns/locale';
import clsx from 'clsx';

const TYPE_MAP = {
  deviation: {label: 'Desvío de ruta',        color: 'text-coral bg-coral/10'},
  stop:      {label: 'Detención prolongada',   color: 'text-amber bg-amber/10'},
  speed:     {label: 'Velocidad excesiva',     color: 'text-red-600 bg-red-50'},
  manual:    {label: 'Reporte manual',         color: 'text-gray-600 bg-gray-100'},
};

export default function IncidentsPage() {
  const [searchParams] = useSearchParams();
  const serviceFilter  = searchParams.get('service') || '';
  const qc             = useQueryClient();

  const {data, isLoading, refetch} = useQuery({
    queryKey: ['incidents', serviceFilter],
    queryFn:  () => incidentsAPI.list({
      service:  serviceFilter || undefined,
      ordering: '-created_at',
    }).then(r => r.data),
    refetchInterval: 15_000,
  });

  const incidents = data?.results || data || [];

  const handleResolve = async id => {
    try {
      await incidentsAPI.resolve(id);
      toast.success('Incidencia marcada como resuelta.');
      qc.invalidateQueries(['incidents']);
    } catch {
      toast.error('No se pudo resolver la incidencia.');
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
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3">Hace</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {incidents.map(inc => {
                const cfg = TYPE_MAP[inc.type] || TYPE_MAP.manual;
                return (
                  <tr key={inc.id} className={clsx('transition', inc.resolved && 'opacity-50')}>
                    <td className="px-5 py-3.5">
                      <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold', cfg.color)}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 max-w-xs truncate">{inc.description}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                      #{String(inc.service).slice(-8).toUpperCase()}
                    </td>
                    <td className="px-5 py-3.5">
                      {inc.resolved
                        ? <span className="text-xs text-green-600 font-semibold">Resuelta</span>
                        : <span className="text-xs text-coral font-semibold">Abierta</span>}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {formatDistanceToNow(new Date(inc.created_at), {locale: es, addSuffix: true})}
                    </td>
                    <td className="px-5 py-3.5">
                      {!inc.resolved && (
                        <Button size="sm" variant="ghost" onClick={() => handleResolve(inc.id)}>
                          Resolver
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
    </div>
  );
}
