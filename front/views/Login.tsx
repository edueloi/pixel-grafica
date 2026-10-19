import React, { useState } from 'react';
import { User as UserIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { Button, Input, ContentCard } from '../components/ui';
import { PixelMark } from '../components/PixelLogo';
import { api, errMsg } from '../api';
import type { User } from '../types';

const Login: React.FC<{ onLogin: (token: string, user: User) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError('');
    try {
      const r = await api.post<{ token: string; user: User }>('/auth/login', { username: email.trim(), password });
      onLogin(r.token, r.user);
    } catch (err) {
      setError(errMsg(err));
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4 bg-gradient-to-b from-blue-50 to-slate-50">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <PixelMark size={44} />
          <h1 className="text-lg font-semibold text-slate-900">Pixel <span className="text-blue-600">Gráfica</span></h1>
          <p className="text-xs text-slate-500">Entre para acessar o sistema de gestão.</p>
        </div>
        <ContentCard padding="md">
          <form onSubmit={submit} className="space-y-3">
            <Input label="Usuário" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="admin" value={email} onChange={(e) => setEmail(e.target.value)} iconLeft={<UserIcon size={14} />} required autoFocus />
            <Input label="Senha" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} iconLeft={<Lock size={14} />} required
              iconRight={
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword}
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'} className="p-1 -mr-1 rounded text-zinc-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              } />
            {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
            <Button type="submit" fullWidth loading={loading}>Entrar</Button>
          </form>
        </ContentCard>
      </div>
    </div>
  );
};

export default Login;
