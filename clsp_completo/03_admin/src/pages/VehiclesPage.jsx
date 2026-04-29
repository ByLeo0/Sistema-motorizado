import {useState} from 'react';
import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {PageHeader, Spinner} from '../components/ui';
import {vehiclesAPI, usersAPI} from '../services/api';
import toast from 'react-hot-toast';

const EMPTY_FORM = {
  plate: '',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  fuel_consumption_rate: 50,
  mileage: 0,
  status: 'active',
  assigned_motorizado: '',
  last_maintenance: '',
  next_maintenance: '',
  notes: '',
};

export default function VehiclesPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm]   = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [formData, setFormData]   = useState(EMPTY_FORM);

  const {data: vehiclesData, isLoading} = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => vehiclesAPI.list().then(r => r.data),
  });

  const {data: motorizadosData} = useQuery({
    queryKey: ['motorizados'],
    queryFn:  () => usersAPI.motorizados().then(r => r.data),
  });

  const vehicles    = vehiclesData?.results ?? vehiclesData ?? [];
  const motorizados = motorizadosData ?? [];

  const createMutation = useMutation({
    mutationFn: data => vehiclesAPI.create(data),
    onSuccess: () => {
      toast.success('Vehículo agregado correctamente.');
      qc.invalidateQueries(['vehicles']);
      setShowForm(false);
      setFormData(EMPTY_FORM);
    },
    onError: err => {
      const errors = err.response?.data;
      toast.error(errors ? Object.values(errors).flat().join(' ') : 'Error al agregar el vehículo.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({id, data}) => vehiclesAPI.update(id, data),
    onSuccess: () => {
      toast.success('Vehículo actualizado.');
      qc.invalidateQueries(['vehicles']);
      setEditingVehicle(null);
      setFormData(EMPTY_FORM);
    },
    onError: err => {
      const errors = err.response?.data;
      toast.error(errors ? Object.values(errors).flat().join(' ') : 'Error al actualizar.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: id => vehiclesAPI.delete(id),
    onSuccess: () => {
      toast.success('Vehículo eliminado.');
      qc.invalidateQueries(['vehicles']);
    },
    onError: () => toast.error('No se pudo eliminar el vehículo.'),
  });

  const openCreate = () => {
    setEditingVehicle(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = v => {
    setEditingVehicle(v);
    setFormData({
      plate:                v.plate,
      brand:                v.brand,
      model:                v.model,
      year:                 v.year,
      fuel_consumption_rate: v.fuel_consumption_rate,
      mileage:              v.mileage,
      status:               v.status,
      assigned_motorizado:  v.assigned_motorizado ?? '',
      last_maintenance:     v.last_maintenance ?? '',
      next_maintenance:     v.next_maintenance ?? '',
      notes:                v.notes ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.plate || !formData.brand || !formData.model) {
      toast.error('Completa placa, marca y modelo.');
      return;
    }
    const payload = {
      ...formData,
      assigned_motorizado: formData.assigned_motorizado || null,
      last_maintenance:    formData.last_maintenance || null,
      next_maintenance:    formData.next_maintenance || null,
    };
    if (editingVehicle) {
      updateMutation.mutate({id: editingVehicle.id, data: payload});
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id, label) => {
    if (!window.confirm(`¿Eliminar ${label}?`)) return;
    deleteMutation.mutate(id);
  };

  const setField = (f, v) => setFormData(p => ({...p, [f]: v}));

  const active      = vehicles.filter(v => v.status === 'active').length;
  const maintenance = vehicles.filter(v => v.status === 'maintenance').length;
  const avgFuel     = vehicles.length
    ? Math.round(vehicles.reduce((a, v) => a + v.fuel_consumption_rate, 0) / vehicles.length)
    : 0;
  const totalKm = vehicles.reduce((a, v) => a + v.mileage, 0);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (isLoading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <PageHeader
          title="Gestión de vehículos"
          subtitle={`${vehicles.length} motos registradas`}
        />
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:opacity-90 transition shrink-0">
          + Agregar moto
        </button>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Activas"          value={active}                         icon="✓"  cls="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" />
        <StatCard label="En mantenimiento" value={maintenance}                     icon="🔧" cls="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" />
        <StatCard label="Consumo promedio" value={vehicles.length ? `${avgFuel} km/l` : '—'} icon="⛽" cls="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400" />
        <StatCard label="Km totales"       value={totalKm.toLocaleString()}        icon="🛣"  cls="bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400" />
      </div>

      {/* Modal agregar / editar */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingVehicle ? 'Editar vehículo' : 'Agregar moto'}
            </h2>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <FormField label="Placa *"  value={formData.plate}  onChange={v => setField('plate', v)} placeholder="Ej: ABC-123" />
              <FormField label="Marca *"  value={formData.brand}  onChange={v => setField('brand', v)} placeholder="Honda" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <FormField label="Modelo *" value={formData.model}  onChange={v => setField('model', v)} placeholder="Wave 110" />
              <FormField label="Año"      value={formData.year}   onChange={v => setField('year', Number(v))} type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <FormField label="Km recorridos" value={formData.mileage}              onChange={v => setField('mileage', Number(v))} type="number" />
              <FormField label="Consumo (km/l)" value={formData.fuel_consumption_rate} onChange={v => setField('fuel_consumption_rate', Number(v))} type="number" />
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Estado</label>
              <select
                value={formData.status}
                onChange={e => setField('status', e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
                <option value="active">Activo</option>
                <option value="maintenance">En mantenimiento</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Motorizado asignado</label>
              <select
                value={formData.assigned_motorizado}
                onChange={e => setField('assigned_motorizado', e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
                <option value="">Sin asignar</option>
                {motorizados.map(m => (
                  <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <FormField label="Último mantenimiento" value={formData.last_maintenance} onChange={v => setField('last_maintenance', v)} type="date" />
              <FormField label="Próximo mantenimiento" value={formData.next_maintenance} onChange={v => setField('next_maintenance', v)} type="date" />
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Notas / Problemas</label>
              <textarea
                value={formData.notes}
                onChange={e => setField('notes', e.target.value)}
                rows={2}
                placeholder="Problemas reportados, observaciones..."
                className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none" />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setShowForm(false); setEditingVehicle(null); setFormData(EMPTY_FORM); }}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                {isSaving ? 'Guardando...' : editingVehicle ? 'Guardar cambios' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {vehicles.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">🏍</p>
          <p className="text-gray-500 dark:text-gray-400 font-medium">No hay vehículos registrados.</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Agrega la primera moto del equipo.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-4 font-bold text-gray-700 dark:text-gray-200">Vehículo</th>
                  <th className="text-left px-5 py-4 font-bold text-gray-700 dark:text-gray-200">Motorizado</th>
                  <th className="text-right px-5 py-4 font-bold text-gray-700 dark:text-gray-200">Km</th>
                  <th className="text-right px-5 py-4 font-bold text-gray-700 dark:text-gray-200">Consumo</th>
                  <th className="text-left px-5 py-4 font-bold text-gray-700 dark:text-gray-200">Mantenimiento</th>
                  <th className="text-left px-5 py-4 font-bold text-gray-700 dark:text-gray-200">Estado</th>
                  <th className="px-5 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {vehicles.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-800 dark:text-gray-100">{v.brand} {v.model} {v.year}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{v.plate}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {v.assigned_motorizado_name ?? <span className="text-gray-400 dark:text-gray-600 italic">Sin asignar</span>}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-800 dark:text-gray-100">
                      {v.mileage.toLocaleString()}
                    </td>
                    <td className="px-5 py-4 text-right font-medium text-gray-800 dark:text-gray-100">
                      {v.fuel_consumption_rate} km/l
                    </td>
                    <td className="px-5 py-4">
                      {v.next_maintenance ? (
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          <p>Próx: {new Date(v.next_maintenance + 'T12:00:00').toLocaleDateString('es-PE')}</p>
                          {v.last_maintenance && (
                            <p className="text-gray-400 dark:text-gray-500">Últ: {new Date(v.last_maintenance + 'T12:00:00').toLocaleDateString('es-PE')}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600 text-xs italic">No programado</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(v)}
                          className="px-2.5 py-1 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(v.id, `${v.brand} ${v.model} (${v.plate})`)}
                          className="px-2.5 py-1 border border-red-200 dark:border-red-900/50 text-red-500 dark:text-red-400 rounded-lg text-xs hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Problemas reportados */}
      {vehicles.some(v => v.notes) && (
        <div className="mt-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/50 rounded-2xl p-5">
          <h3 className="text-sm font-bold text-orange-700 dark:text-orange-400 mb-3">⚠ Notas y problemas</h3>
          <div className="space-y-2">
            {vehicles.filter(v => v.notes).map(v => (
              <p key={v.id} className="text-sm text-orange-600 dark:text-orange-300">
                <strong>{v.brand} {v.model}</strong> ({v.plate}): {v.notes}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({status}) {
  const cfg = {
    active:      {cls: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', label: '✓ Activo'},
    maintenance: {cls: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',     label: '🔧 Mantenimiento'},
    inactive:    {cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',               label: '● Inactivo'},
  }[status] ?? {cls: 'bg-gray-100 text-gray-500', label: status};

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatCard({label, value, icon, cls}) {
  return (
    <div className={`${cls} rounded-xl p-4 flex items-center gap-3`}>
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-xs opacity-75">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

function FormField({label, value, onChange, type = 'text', placeholder}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
    </div>
  );
}
