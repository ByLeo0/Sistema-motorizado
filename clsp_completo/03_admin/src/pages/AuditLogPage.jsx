import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {PageHeader, Spinner} from '../components/ui';
import {auditAPI} from '../services/api';
import {format} from 'date-fns';
import {es} from 'date-fns/locale';

const ACTION_COLORS = {
  service_rejected:   {bg: 'bg-red-50 dark:bg-red-900/20',       text: 'text-red-600 dark:text-red-400',       icon: '✕'},
  incident_detected:  {bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400', icon: '⚠'},
  incident_resolved:  {bg: 'bg-teal-50 dark:bg-teal-900/20',     text: 'text-teal-600 dark:text-teal-400',     icon: '✓'},
};

const TYPE_LABELS = {
  service_rejected:  'Rechazo de servicio',
  incident_detected: 'Incidencia del sistema',
  incident_resolved: 'Incidencia resuelta',
};

export default function AuditLogPage() {
  const [filterType,   setFilterType]   = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [days,         setDays]         = useState(7);

  const {data, isLoading} = useQuery({
    queryKey: ['audit', days, filterType, filterStatus],
    queryFn:  () => auditAPI.list({days, type: filterType, status: filterStatus}).then(r => r.data),
  });

  const logs         = data ?? [];
  const errorCount   = logs.filter(l => l.status === 'error').length;
  const successCount = logs.filter(l => l.status === 'success').length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Auditoría del sistema"
        subtitle="Modificaciones administrativas y errores detectados"
      />

      {/* Alerta de errores activos */}
      {errorCount > 0 && (
        <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-2xl p-4 flex items-start gap-4">
          <span className="text-2xl mt-0.5">⚠</span>
          <div>
            <p className="font-bold text-red-700 dark:text-red-400">Errores / modificaciones detectadas</p>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
              {errorCount} evento{errorCount > 1 ? 's' : ''} de error o rechazo en el período seleccionado.
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Período</label>
            <select
              value={days}
              onChange={e => setDays(Number(e.target.value))}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value={1}>Últimas 24 horas</option>
              <option value={7}>Últimos 7 días</option>
              <option value={30}>Últimos 30 días</option>
              <option value={90}>Últimos 90 días</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo de evento</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="all">Todos</option>
              <option value="service_rejected">Rechazo de servicio</option>
              <option value="incident_detected">Incidencia detectada</option>
              <option value="incident_resolved">Incidencia resuelta</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Estado</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="all">Todos</option>
              <option value="error">Error / Rechazo</option>
              <option value="success">Resuelto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total registros"     value={isLoading ? '…' : logs.length}   icon="📋" cls="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" />
        <StatCard label="Errores / Rechazos"  value={isLoading ? '…' : errorCount}    icon="⚠"  cls="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" />
        <StatCard label="Resueltos"           value={isLoading ? '…' : successCount}  icon="✓"  cls="bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400" />
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : logs.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 text-center">
          <p className="text-3xl mb-3">✅</p>
          <p className="text-gray-500 dark:text-gray-400 font-medium">Sin incidencias ni modificaciones.</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Aparecerán aquí los rechazos de servicios e incidencias detectadas automáticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map(log => {
            const colors = ACTION_COLORS[log.type] ?? {
              bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', icon: '●'
            };
            return (
              <div
                key={log.id}
                className={`${colors.bg} border border-gray-100 dark:border-gray-700 rounded-xl p-4 flex gap-4`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg ${colors.bg} ${colors.text}`}>
                  {colors.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm ${colors.text}`}>{log.action}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{log.details}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-500">
                        <span>{log.user_name}</span>
                        <span>•</span>
                        <span>{TYPE_LABELS[log.type] ?? log.type}</span>
                        <span>•</span>
                        <span>{format(new Date(log.timestamp), "d 'de' MMMM yyyy, HH:mm", {locale: es})}</span>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${
                      log.status === 'success'
                        ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
                        : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                    }`}>
                      {log.status === 'success' ? 'Resuelto' : 'Error'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Leyenda */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Qué registra la auditoría</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-600 dark:text-gray-400">
          <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-xl p-3">
            <p className="font-semibold text-red-700 dark:text-red-400 mb-1">✕ Rechazos de servicio</p>
            <p>Un administrador rechazó una solicitud de entrega, con el motivo registrado.</p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 rounded-xl p-3">
            <p className="font-semibold text-orange-700 dark:text-orange-400 mb-1">⚠ Incidencias detectadas</p>
            <p>El sistema detectó automáticamente desvíos, paradas prolongadas, velocidad excesiva u otros problemas.</p>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/10 border border-teal-100 dark:border-teal-900/30 rounded-xl p-3">
            <p className="font-semibold text-teal-700 dark:text-teal-400 mb-1">✓ Incidencias resueltas</p>
            <p>Un administrador marcó la incidencia como resuelta, cerrando el problema.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({label, value, icon, cls}) {
  return (
    <div className={`${cls} rounded-xl p-4 flex items-center gap-3 border border-gray-200 dark:border-gray-700`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-xs opacity-75">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
