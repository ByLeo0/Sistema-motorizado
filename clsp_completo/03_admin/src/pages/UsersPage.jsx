import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {usersAPI} from '../services/api';
import {PageHeader, Button, Modal, Spinner} from '../components/ui';
import toast from 'react-hot-toast';
import {format} from 'date-fns';
import {es} from 'date-fns/locale';
import clsx from 'clsx';

const ROLE_CFG = {
  admin:      {label: 'Administradores', singular: 'Administrador', cls: 'bg-brand/10 text-brand',   dot: 'bg-brand'},
  motorizado: {label: 'Motorizados',     singular: 'Motorizado',    cls: 'bg-teal/10 text-teal',     dot: 'bg-teal'},
  cliente:    {label: 'Clientes',        singular: 'Cliente',       cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400'},
};

const ROLE_ORDER = ['admin', 'motorizado', 'cliente'];

const EMPTY_FORM = {
  email: '', first_name: '', last_name: '',
  phone: '', role: 'motorizado', password: '', password2: '',
};

export default function UsersPage() {
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [saving,     setSaving]     = useState(false);

  const [editUser,   setEditUser]   = useState(null);
  const [editForm,   setEditForm]   = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [pwdForm,    setPwdForm]    = useState({new_password: '', confirm: ''});
  const [pwdSaving,  setPwdSaving]  = useState(false);
  const [pwdOpen,    setPwdOpen]    = useState(false);

  const [toggling,   setToggling]   = useState(null);
  const [collapsed,  setCollapsed]  = useState({});

  const {data, isLoading} = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersAPI.list().then(r => r.data),
  });

  const users = data?.results || data || [];

  // Agrupar por rol
  const grouped = ROLE_ORDER.reduce((acc, role) => {
    acc[role] = users.filter(u => u.role === role);
    return acc;
  }, {});

  // ── Crear ──────────────────────────────────────────────────────────────
  const handleCreate = async e => {
    e.preventDefault();
    if (form.password !== form.password2) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      await usersAPI.create(form);
      toast.success('Usuario creado correctamente.');
      qc.invalidateQueries(['users']);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      const errors = err.response?.data;
      toast.error(errors ? Object.values(errors).flat().join(' ') : 'Error al crear el usuario.');
    } finally {
      setSaving(false);
    }
  };

  // ── Editar ─────────────────────────────────────────────────────────────
  const openEdit = u => {
    setEditUser(u);
    setEditForm({first_name: u.first_name || '', last_name: u.last_name || '', phone: u.phone || '', role: u.role || 'cliente'});
    setPwdForm({new_password: '', confirm: ''});
    setPwdOpen(false);
  };

  const handleEdit = async e => {
    e.preventDefault();
    setEditSaving(true);
    try {
      await usersAPI.update(editUser.id, editForm);
      toast.success('Usuario actualizado.');
      qc.invalidateQueries(['users']);
      setEditUser(null);
    } catch (err) {
      const errors = err.response?.data;
      toast.error(errors ? Object.values(errors).flat().join(' ') : 'Error al actualizar.');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Cambiar contraseña ─────────────────────────────────────────────────
  const handleSetPassword = async e => {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }
    if (pwdForm.new_password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setPwdSaving(true);
    try {
      await usersAPI.setPassword(editUser.id, pwdForm.new_password);
      toast.success('Contraseña actualizada correctamente.');
      setPwdForm({new_password: '', confirm: ''});
      setPwdOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al cambiar la contraseña.');
    } finally {
      setPwdSaving(false);
    }
  };

  // ── Toggle activo ──────────────────────────────────────────────────────
  const handleToggle = async (id, name, isActive) => {
    setToggling(id);
    try {
      await usersAPI.toggleActive(id);
      toast.success(`${name} ${isActive ? 'desactivado' : 'activado'}.`);
      qc.invalidateQueries(['users']);
    } catch {
      toast.error('No se pudo cambiar el estado del usuario.');
    } finally {
      setToggling(null);
    }
  };

  const toggleCollapse = role =>
    setCollapsed(prev => ({...prev, [role]: !prev[role]}));

  const setField     = (f, v) => setForm(p     => ({...p, [f]: v}));
  const setEditField = (f, v) => setEditForm(p => ({...p, [f]: v}));

  if (isLoading) return <div className="flex justify-center py-24"><Spinner /></div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="Usuarios"
        subtitle={`${users.length} usuarios registrados`}
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + Nuevo usuario
          </Button>
        }
      />

      {/* Secciones por rol */}
      <div className="flex flex-col gap-5">
        {ROLE_ORDER.map(role => {
          const cfg   = ROLE_CFG[role];
          const group = grouped[role] || [];
          const open  = !collapsed[role];

          return (
            <section key={role} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">

              {/* Cabecera de sección */}
              <button
                onClick={() => toggleCollapse(role)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                <div className="flex items-center gap-3">
                  <span className={clsx('w-2.5 h-2.5 rounded-full shrink-0', cfg.dot)} />
                  <span className="font-bold text-gray-800 dark:text-gray-100">{cfg.label}</span>
                  <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-semibold', cfg.cls)}>
                    {group.length}
                  </span>
                </div>
                <span className={clsx('text-gray-400 dark:text-gray-500 text-sm transition-transform', open ? 'rotate-180' : '')}>
                  ▾
                </span>
              </button>

              {/* Tabla de usuarios */}
              {open && (
                group.length === 0 ? (
                  <div className="px-5 py-8 text-center text-gray-400 dark:text-gray-500 text-sm border-t border-gray-100 dark:border-gray-700">
                    No hay {cfg.label.toLowerCase()} registrados.
                  </div>
                ) : (
                  <div className="border-t border-gray-100 dark:border-gray-700 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-900 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          <th className="px-5 py-2.5">Nombre</th>
                          <th className="px-5 py-2.5">Email</th>
                          <th className="px-5 py-2.5">Teléfono</th>
                          <th className="px-5 py-2.5">Registro</th>
                          <th className="px-5 py-2.5">Estado</th>
                          <th className="px-5 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {group.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={clsx(
                                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold',
                                  cfg.cls,
                                )}>
                                  {u.first_name?.[0]}{u.last_name?.[0]}
                                </div>
                                <span className="font-medium text-gray-800 dark:text-gray-100">{u.full_name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                            <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{u.phone || '—'}</td>
                            <td className="px-5 py-3 text-gray-400 dark:text-gray-500 text-xs">
                              {format(new Date(u.date_joined), "d MMM yyyy", {locale: es})}
                            </td>
                            <td className="px-5 py-3">
                              <span className={clsx(
                                'px-2 py-0.5 rounded-full text-xs font-semibold',
                                u.is_active ? 'bg-teal/10 text-teal' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
                              )}>
                                {u.is_active ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                                  Editar
                                </Button>
                                <Button
                                  variant={u.is_active ? 'ghost' : 'outline'}
                                  size="sm"
                                  disabled={toggling === u.id}
                                  onClick={() => handleToggle(u.id, u.full_name, u.is_active)}>
                                  {toggling === u.id ? '...' : u.is_active ? 'Desactivar' : 'Activar'}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </section>
          );
        })}
      </div>

      {/* Modal Crear usuario */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setForm(EMPTY_FORM); }}
        title="Crear nuevo usuario"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creando...' : 'Crear usuario'}
            </Button>
          </>
        }>
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre"   value={form.first_name} onChange={v => setField('first_name', v)} />
            <Field label="Apellido" value={form.last_name}  onChange={v => setField('last_name', v)} />
          </div>
          <Field label="Correo electrónico" type="email" value={form.email} onChange={v => setField('email', v)} />
          <Field label="Teléfono" value={form.phone} onChange={v => setField('phone', v)} placeholder="Opcional" />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Cargo / Rol</label>
            <select
              value={form.role}
              onChange={e => setField('role', e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="motorizado">Motorizado</option>
              <option value="cliente">Cliente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <Field label="Contraseña"           type="password" value={form.password}  onChange={v => setField('password', v)} />
          <Field label="Confirmar contraseña" type="password" value={form.password2} onChange={v => setField('password2', v)} />
        </form>
      </Modal>

      {/* Modal Editar usuario */}
      <Modal
        open={!!editUser}
        onClose={() => setEditUser(null)}
        title={`Editar — ${editUser?.full_name || ''}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button variant="primary" onClick={handleEdit} disabled={editSaving}>
              {editSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </>
        }>
        <form onSubmit={handleEdit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre"   value={editForm.first_name || ''} onChange={v => setEditField('first_name', v)} />
            <Field label="Apellido" value={editForm.last_name  || ''} onChange={v => setEditField('last_name', v)} />
          </div>
          <Field label="Teléfono" value={editForm.phone || ''} onChange={v => setEditField('phone', v)} placeholder="Opcional" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Cargo / Rol</label>
            <select
              value={editForm.role || 'cliente'}
              onChange={e => setEditField('role', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30">
              <option value="motorizado">Motorizado</option>
              <option value="cliente">Cliente</option>
              <option value="admin">Administrador</option>
            </select>
          </div>

          {/* Cambiar contraseña */}
          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setPwdOpen(v => !v)}
              className="text-sm text-brand hover:underline font-medium">
              {pwdOpen ? '▾ Ocultar cambio de contraseña' : '▸ Cambiar contraseña'}
            </button>
            {pwdOpen && (
              <div className="flex flex-col gap-3 mt-3">
                <Field
                  label="Nueva contraseña"
                  type="password"
                  value={pwdForm.new_password}
                  onChange={v => setPwdForm(p => ({...p, new_password: v}))}
                  placeholder="Mínimo 8 caracteres"
                />
                <Field
                  label="Confirmar contraseña"
                  type="password"
                  value={pwdForm.confirm}
                  onChange={v => setPwdForm(p => ({...p, confirm: v}))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pwdSaving}
                  onClick={handleSetPassword}>
                  {pwdSaving ? 'Guardando...' : 'Guardar nueva contraseña'}
                </Button>
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({label, type = 'text', value, onChange, placeholder}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
      />
    </div>
  );
}
