import React, {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuthStore} from '../store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const {login, isLoading}      = useAuthStore();
  const navigate                = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    if (!email || !password) { toast.error('Completa todos los campos.'); return; }
    try {
      const user = await login(email.trim().toLowerCase(), password);
      if (user.role !== 'admin') {
        toast.error('Solo los administradores pueden acceder al panel.');
        await useAuthStore.getState().logout();
        return;
      }
      toast.success(`Bienvenido, ${user.first_name}.`);
      navigate('/dashboard');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Credenciales incorrectas.';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F0F4FF] to-[#E8F5EE] p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-brand items-center justify-center shadow-lg mb-4">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">CLSP S.A.C.</h1>
          <p className="text-sm text-gray-400 mt-1">Panel Administrativo</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@clsp.pe"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition text-sm">
            {isLoading ? 'Ingresando...' : 'Ingresar al panel'}
          </button>
        </form>
      </div>
    </div>
  );
}
