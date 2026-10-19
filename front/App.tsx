import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/Layout';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import Customers from './views/Customers';
import Products from './views/Products';
import Quotes from './views/Quotes';
import Orders from './views/Orders';
import Files from './views/Files';
import Whatsapp from './views/Whatsapp';
import BotSettings from './views/BotSettings';
import Users from './views/Users';
import ProductFormPage from './views/ProductFormPage';
import ProductDetail from './views/ProductDetail';
import CustomerFormPage from './views/CustomerFormPage';
import CustomerDetail from './views/CustomerDetail';
import QuoteFormPage from './views/QuoteFormPage';
import QuoteDetail from './views/QuoteDetail';
import OrderFormPage from './views/OrderFormPage';
import OrderDetail from './views/OrderDetail';
import Services from './views/Services';
import ServiceFormPage from './views/ServiceFormPage';
import ServicesImportPage from './views/ServicesImportPage';
import ServicesProfitPage from './views/ServicesProfitPage';
import SettingsPage from './views/SettingsPage';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(!!getToken());

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  // Sessão salva: confirma com o servidor antes de mostrar o painel
  useEffect(() => {
    if (!getToken()) return;
    api.get<{ user: User }>('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <div role="status" className="h-[100dvh] flex items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" />Carregando…</div>;
  }

  const admin = user?.role === 'admin';
  const sells = admin || user?.role === 'atendente';

  return (
    <ToastProvider>
      <BrowserRouter>
        {!user ? (
          <Routes>
            <Route path="*" element={<Login onLogin={(token, u) => { setToken(token); setUser(u); }} />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Layout currentUser={user} onLogout={logout} />}>
              <Route index element={<Dashboard user={user} />} />
              <Route path="pedidos" element={<Orders />} />
              <Route path="pedidos/novo" element={<OrderFormPage />} />
              <Route path="pedidos/:id/editar" element={<OrderFormPage />} />
              <Route path="pedidos/:id" element={<OrderDetail />} />
              <Route path="orcamentos" element={<Quotes />} />
              <Route path="orcamentos/novo" element={<QuoteFormPage />} />
              <Route path="orcamentos/:id/editar" element={<QuoteFormPage />} />
              <Route path="orcamentos/:id" element={<QuoteDetail />} />
              <Route path="clientes" element={<Customers />} />
              <Route path="clientes/novo" element={<CustomerFormPage />} />
              <Route path="clientes/:id/editar" element={<CustomerFormPage />} />
              <Route path="clientes/:id" element={<CustomerDetail />} />
              <Route path="servicos" element={<Services />} />
              <Route path="servicos/novo" element={<ServiceFormPage />} />
              <Route path="servicos/importar" element={<ServicesImportPage />} />
              <Route path="servicos/lucro" element={<ServicesProfitPage />} />
              <Route path="servicos/:id" element={<ServiceFormPage />} />
              <Route path="arquivos" element={<Files />} />
              {sells && <Route path="whatsapp" element={<Navigate to="/whatsapp/fila" replace />} />}
              {sells && <Route path="whatsapp/:tab" element={<Whatsapp user={user} />} />}
              {sells && <Route path="produtos" element={<Products />} />}
              {sells && <Route path="produtos/novo" element={<ProductFormPage />} />}
              {sells && <Route path="produtos/:id/editar" element={<ProductFormPage />} />}
              {sells && <Route path="produtos/:id" element={<ProductDetail />} />}
              {admin && <Route path="bot" element={<BotSettings />} />}
              {admin && <Route path="configuracoes" element={<SettingsPage />} />}
              {admin && <Route path="usuarios" element={<Users currentUser={user} />} />}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        )}
      </BrowserRouter>
    </ToastProvider>
  );
};

export default App;
