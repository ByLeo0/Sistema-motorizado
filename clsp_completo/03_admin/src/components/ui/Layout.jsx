import React, {useState} from 'react';
import {Outlet, NavLink, useNavigate} from 'react-router-dom';
import {useAuthStore, useThemeStore} from '../../store';
import clsx from 'clsx';

const NAV = [
  {to: '/dashboard',  label: 'Dashboard',   icon: '▣'},
  {to: '/services',   label: 'Servicios',   icon: '◈'},
  {to: '/live-map',   label: 'Mapa en vivo', icon: '◎'},
  {to: '/incidents',  label: 'Incidencias', icon: '⚑'},
  {to: '/users',      label: 'Usuarios',    icon: '◉'},
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const user      = useAuthStore(s => s.user);
  const logout    = useAuthStore(s => s.logout);
  const navigate  = useNavigate();
  const theme     = useThemeStore(s => s.theme);
  const toggle    = useThemeStore(s => s.toggle);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F6FA]">

      {/* Sidebar */}
      <aside className={clsx(
        'flex flex-col bg-white border-r border-gray-100 transition-all duration-200 shadow-sm',
        collapsed ? 'w-16' : 'w-56',
      )}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          {!collapsed && <span className="font-bold text-brand text-lg tracking-wider">CLSP</span>}
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
          {NAV.map(({to, label, icon}) => (
            <NavLink
              key={to}
              to={to}
              className={({isActive}) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand/10 text-brand'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800',
              )}>
              <span className="text-base w-5 text-center shrink-0">{icon}</span>
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User + theme + logout */}
        <div className="border-t border-gray-100 p-3 flex flex-col gap-1">
          {!collapsed && (
            <div className="mb-1 px-2">
              <p className="text-xs font-semibold text-gray-800 truncate">{user?.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{user?.email}</p>
            </div>
          )}

          {/* Botón tema */}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
            <span className="text-base w-5 text-center shrink-0">
              {theme === 'dark' ? '☀' : '🌙'}
            </span>
            {!collapsed && (
              <span>{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-coral hover:bg-coral/10 transition-colors">
            <span className="w-5 text-center shrink-0">⏏</span>
            {!collapsed && 'Salir'}
          </button>
        </div>

        {/* Colapsar */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-brand shadow-sm text-xs flex items-center justify-center">
          {collapsed ? '›' : '‹'}
        </button>
      </aside>

      {/* Contenido principal */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
