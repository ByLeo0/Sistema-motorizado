import React, {useState, useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {servicesAPI, incidentsAPI, trackingAPI, usersAPI} from '../services/api';
import {StatusBadge, Spinner} from '../components/ui';
import {formatDistanceToNow, format} from 'date-fns';
import {es} from 'date-fns/locale';

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({label, value, icon, color, subtitle, onClick}) {
  const colors = {
    amber: {
      bg:     'bg-amber-100 dark:bg-amber-950',
      text:   'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-900',
      dot:    'bg-amber-500',
      sub:    'text-amber-600 dark:text-amber-400',
    },
    brand: {
      bg:     'bg-violet-100 dark:bg-violet-950',
      text:   'text-violet-700 dark:text-violet-300',
      border: 'border-violet-200 dark:border-violet-900',
      dot:    'bg-violet-500',
      sub:    'text-violet-500 dark:text-violet-400',
    },
    teal: {
      bg:     'bg-emerald-100 dark:bg-emerald-950',
      text:   'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-900',
      dot:    'bg-emerald-500',
      sub:    'text-emerald-600 dark:text-emerald-400',
    },
    coral: {
      bg:     'bg-red-100 dark:bg-red-950',
      text:   'text-red-600 dark:text-red-400',
      border: 'border-red-200 dark:border-red-900',
      dot:    'bg-red-500',
      sub:    'text-red-500 dark:text-red-400',
    },
    gray: {
      bg:     'bg-gray-100 dark:bg-gray-800',
      text:   'text-gray-700 dark:text-gray-200',
      border: 'border-gray-200 dark:border-gray-700',
      dot:    'bg-gray-400 dark:bg-gray-500',
      sub:    'text-gray-500 dark:text-gray-400',
    },
  };
  const c = colors[color] ?? colors.gray;
  return (
    <div
      onClick={onClick}
      className={`${c.bg} ${c.border} border rounded-2xl p-4 flex flex-col gap-2 transition
        ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-lg">{icon}</span>
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      </div>
      <p className={`text-3xl font-bold ${c.text}`}>{value ?? '—'}</p>
      <div>
        <p className={`text-xs font-semibold ${c.text} opacity-80`}>{label}</p>
        {subtitle && <p className={`text-xs mt-0.5 ${c.sub}`}>{subtitle}</p>}
      </div>
    </div>
  );
}

function BarChart({data}) {
  if (!data?.length) return (
    <div className="flex items-center justify-center h-32 text-sm text-gray-400 dark:text-gray-500">Sin datos para el período.</div>
  );
  const max   = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((a, d) => a + d.count, 0);
  return (
    <div>
      <div className="flex items-end gap-1 h-28 pb-1">
        {data.map(d => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-700 text-white text-xs rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
              {d.count} entregas
            </div>
            <div
              className="w-full bg-violet-500 dark:bg-violet-600 rounded-t group-hover:bg-violet-600 dark:group-hover:bg-violet-500 transition"
              style={{height: `${Math.max(4, (d.count / max) * 96)}px`}}
            />
            <span className="text-[9px] text-gray-400 dark:text-gray-500">{d.date.slice(5)}</span>
          </div>
        ))}
      </div>
      <p className="text-right text-xs text-gray-400 dark:text-gray-500 mt-1">{total} total</p>
    </div>
  );
}

function SectionHeader({title, action, onAction}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
      <h2 className="font-bold text-gray-800 dark:text-gray-100 text-sm">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-medium">
          {action}
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate    = useNavigate();
  const [statsDays, setStatsDays] = useState(30);
  const [selectedMotoId, setSelectedMotoId] = useState('');

  const {data: dash, isLoading: loadDash} = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => servicesAPI.dashboard().then(r => r.data),
    refetchInterval: 30_000,
  });

  const {data: recent, isLoading: loadRecent} = useQuery({
    queryKey: ['services-recent'],
    queryFn:  () => servicesAPI.list({ordering: '-created_at', page_size: 6}).then(r => r.data),
    refetchInterval: 20_000,
  });

  const {data: incidents} = useQuery({
    queryKey: ['incidents-open'],
    queryFn:  () => incidentsAPI.list({resolved: false, page_size: 5}).then(r => r.data),
    refetchInterval: 15_000,
  });

  const {data: stats, isLoading: loadStats} = useQuery({
    queryKey: ['tracking-stats', statsDays],
    queryFn:  () => trackingAPI.stats(statsDays).then(r => r.data),
    refetchInterval: 60_000,
  });

  const openIncidents = incidents?.results?.length ?? incidents?.length ?? 0;

  // Filtrar horas por motorizado seleccionado
  const allMotoHours = stats?.motorizado_hours ?? [];
  const filteredMotoHours = useMemo(() => {
    if (!selectedMotoId) return allMotoHours;
    return allMotoHours.filter(m => m.motorizado_id === selectedMotoId);
  }, [allMotoHours, selectedMotoId]);

  const displayedMotoHours = filteredMotoHours.length > 0 ? filteredMotoHours : allMotoHours;
  const maxHours = displayedMotoHours[0]?.hours || 1;

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {format(new Date(), "EEEE d 'de' MMMM yyyy", {locale: es})}
          </p>
        </div>
        {openIncidents > 0 && (
          <button
            onClick={() => navigate('/incidents')}
            className="flex items-center gap-2 bg-red-50 dark:bg-red-950 border border-red-100 dark:border-red-900 text-red-500 dark:text-red-400 text-sm font-semibold px-4 py-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900 transition">
            ⚠ {openIncidents} incidencia{openIncidents > 1 ? 's' : ''} activa{openIncidents > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* KPI cards */}
      {loadDash ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Pendientes"  value={dash?.pending}    icon="🕐" color="amber" subtitle="Por revisar"   onClick={() => navigate('/services?status=pending')} />
          <KpiCard label="Aprobados"   value={dash?.approved}   icon="✅" color="brand" subtitle="Listos"        onClick={() => navigate('/services?status=approved')} />
          <KpiCard label="En tránsito" value={dash?.in_transit} icon="🚚" color="teal"  subtitle="En movimiento" onClick={() => navigate('/services?status=in_transit')} />
          <KpiCard label="Completados" value={dash?.completed}  icon="📦" color="gray"  subtitle="Entregados"    onClick={() => navigate('/services?status=completed')} />
          <KpiCard label="Rechazados"  value={dash?.rejected}   icon="❌" color="coral" subtitle="Cancelados" />
          <KpiCard label="Total"       value={dash?.total}      icon="📊" color="gray"  subtitle="Servicios" />
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label: 'Mapa en vivo',   icon: '🗺',  path: '/live-map',          color: 'bg-violet-600 hover:bg-violet-700'},
          {label: 'Nuevo servicio', icon: '➕',  path: '/services?create=1',  color: 'bg-emerald-600 hover:bg-emerald-700'},
          {label: 'Usuarios',       icon: '👤',  path: '/users',             color: 'bg-sky-600 hover:bg-sky-700'},
          {label: 'Incidencias',    icon: '⚠',  path: '/incidents',          color: 'bg-orange-500 hover:bg-orange-600'},
        ].map(({label, icon, path, color}) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`${color} text-white rounded-2xl p-4 flex items-center gap-3 transition shadow-sm`}>
            <span className="text-2xl">{icon}</span>
            <span className="font-semibold text-sm">{label}</span>
          </button>
        ))}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Servicios recientes */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <SectionHeader title="Servicios recientes" action="Ver todos" onAction={() => navigate('/services')} />
          {loadRecent ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-700">
              {(recent?.results || recent || []).slice(0, 6).map(s => (
                <li
                  key={s.id}
                  onClick={() => navigate(`/services/${s.id}`)}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition group">
                  <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <span className="text-violet-600 dark:text-violet-400 text-xs font-bold">
                      {s.number ? `#${String(s.number).padStart(2,'0')}` : '—'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {s.requester_name || 'Sin cliente'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {formatDistanceToNow(new Date(s.created_at), {locale: es, addSuffix: true})}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={s.status} />
                    <span className="text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition">›</span>
                  </div>
                </li>
              ))}
              {!(recent?.results || recent)?.length && (
                <li className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">Sin servicios recientes.</li>
              )}
            </ul>
          )}
        </div>

        {/* Incidencias abiertas */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
          <SectionHeader
            title={`Incidencias activas${openIncidents > 0 ? ` (${openIncidents})` : ''}`}
            action="Ver todas"
            onAction={() => navigate('/incidents')}
          />
          <ul className="divide-y divide-gray-50 dark:divide-gray-700">
            {(incidents?.results || incidents || []).map(inc => (
              <li key={inc.id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="mt-1.5 w-2.5 h-2.5 rounded-full bg-red-400 shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {inc.type === 'deviation' ? '🔴 Desvío de ruta' : inc.type}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {inc.description || 'Sin descripción'}
                  </p>
                </div>
                <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(inc.created_at), {locale: es, addSuffix: true})}
                </span>
              </li>
            ))}
            {!(incidents?.results || incidents)?.length && (
              <li className="px-5 py-10 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">Sin incidencias activas.</p>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* ── Analytics ───────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-bold text-gray-800 dark:text-gray-100 text-sm">Analíticas operativas</h2>
          <select
            value={statsDays}
            onChange={e => setStatsDays(Number(e.target.value))}
            className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-lg px-2 py-1.5 focus:outline-none">
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>

        {loadStats ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Entregas por día */}
            <div className="lg:col-span-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
                Entregas completadas por día
              </p>
              <BarChart data={stats?.daily_deliveries} />
            </div>

            {/* Tiempo promedio */}
            <div className="flex flex-col items-center justify-center bg-violet-50 dark:bg-violet-950 rounded-2xl p-6 gap-1">
              <p className="text-xs font-semibold text-violet-400 dark:text-violet-300 uppercase tracking-wide text-center">
                Tiempo promedio de servicio
              </p>
              {stats?.avg_service_minutes != null ? (
                <>
                  <p className="text-5xl font-bold text-violet-600 dark:text-violet-400 mt-2">
                    {stats.avg_service_minutes}
                  </p>
                  <p className="text-sm text-violet-400 dark:text-violet-300 font-medium">minutos</p>
                  <p className="text-xs text-violet-300 dark:text-violet-500 mt-1">aprobación → entrega</p>
                </>
              ) : (
                <p className="text-sm text-violet-300 dark:text-violet-500 mt-2">Sin datos suficientes</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Horas por motorizado */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-3">
          <div>
            <h2 className="font-bold text-gray-800 dark:text-gray-100 text-sm">Horas trabajadas por motorizado</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Basado en servicios completados</p>
          </div>
          {allMotoHours.length > 0 && (
            <select
              value={selectedMotoId}
              onChange={e => setSelectedMotoId(e.target.value)}
              className="text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="">Todos los motorizados</option>
              {allMotoHours.map(m => (
                <option key={m.motorizado_id} value={m.motorizado_id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {loadStats ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : displayedMotoHours.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50/60 dark:bg-gray-900/60">
                  <th className="text-left px-5 py-3 font-semibold">Motorizado</th>
                  <th className="text-right px-5 py-3 font-semibold">Horas</th>
                  <th className="text-right px-5 py-3 font-semibold">Entregas</th>
                  <th className="px-5 py-3 font-semibold w-40">Actividad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {displayedMotoHours.map((m, i) => {
                  const pct    = Math.round((m.hours / maxHours) * 100);
                  const medals = ['🥇', '🥈', '🥉'];
                  const isFiltered = selectedMotoId === m.motorizado_id;
                  return (
                    <tr
                      key={m.motorizado_id}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-700 transition ${isFiltered ? 'bg-violet-50/40 dark:bg-violet-950/20' : ''}`}>
                      <td className="px-5 py-4 font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        {medals[i] ?? <span className="text-xs text-gray-400 w-5">{i + 1}</span>}
                        {m.name}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-violet-600 dark:text-violet-400">{m.hours}h</td>
                      <td className="px-5 py-4 text-right text-gray-600 dark:text-gray-400">{m.deliveries}</td>
                      <td className="px-5 py-4">
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-violet-500 h-2 rounded-full transition-all"
                            style={{width: `${pct}%`}}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-10">Sin datos de motorizados aún.</p>
        )}
      </div>

    </div>
  );
}
