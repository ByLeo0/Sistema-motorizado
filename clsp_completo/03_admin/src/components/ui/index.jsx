import React from 'react';
import clsx from 'clsx';

// ── StatusBadge ────────────────────────────────────────────────────────────
const STATUS_MAP = {
  pending:    {label: 'Pendiente',    cls: 'bg-amber-light  text-amber-dark'},
  approved:   {label: 'Aprobado',     cls: 'bg-brand-light  text-brand-dark'},
  in_transit: {label: 'En tránsito',  cls: 'bg-teal-light   text-teal-dark'},
  completed:  {label: 'Completado',   cls: 'bg-green-100     text-green-700'},
  rejected:   {label: 'Rechazado',    cls: 'bg-coral-light  text-coral-dark'},
  cancelled:  {label: 'Cancelado',    cls: 'bg-gray-100      text-gray-500'},
};

export function StatusBadge({status}) {
  const cfg = STATUS_MAP[status] || {label: status, cls: 'bg-gray-100 text-gray-500'};
  return (
    <span className={clsx('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

// ── StatCard ───────────────────────────────────────────────────────────────
export function StatCard({label, value, color = 'brand', onClick}) {
  const colorMap = {
    brand: 'border-brand/30 bg-brand/5  text-brand',
    teal:  'border-teal/30  bg-teal/5   text-teal',
    coral: 'border-coral/30 bg-coral/5  text-coral',
    amber: 'border-amber/30 bg-amber/5  text-amber',
    gray:  'border-gray-200 bg-gray-50  text-gray-500',
  };
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col gap-1 p-4 rounded-2xl border text-left transition hover:shadow-md',
        colorMap[color] || colorMap.brand,
        onClick ? 'cursor-pointer' : 'cursor-default',
      )}>
      <span className="text-3xl font-bold">{value ?? '—'}</span>
      <span className="text-sm font-medium opacity-80">{label}</span>
    </button>
  );
}

// ── PageHeader ─────────────────────────────────────────────────────────────
export function PageHeader({title, subtitle, actions}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// ── Button ─────────────────────────────────────────────────────────────────
export function Button({children, variant = 'primary', size = 'md', disabled, onClick, type = 'button', className}) {
  const base  = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = {sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-base'};
  const vars  = {
    primary:  'bg-brand text-white hover:bg-brand-dark',
    success:  'bg-teal  text-white hover:bg-teal-dark',
    danger:   'bg-coral text-white hover:bg-coral-dark',
    ghost:    'bg-transparent text-gray-600 hover:bg-gray-100',
    outline:  'border border-gray-300 text-gray-700 hover:bg-gray-50',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(base, sizes[size], vars[variant], className)}>
      {children}
    </button>
  );
}

// ── Modal simple ────────────────────────────────────────────────────────────
export function Modal({open, onClose, title, children, footer}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

// ── Spinner ─────────────────────────────────────────────────────────────────
export function Spinner({className = 'w-6 h-6'}) {
  return (
    <svg className={clsx('animate-spin text-brand', className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path  className="opacity-75"  fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}
