import React, { useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

// Mesma aparência e posição usadas nas telas aprovadas, agora pertencentes à UI.
export const toastOptions = {
  duration: 3000,
  style: { background: '#363636', color: '#fff', fontWeight: 600 },
  success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
  error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
};

const icons = {
  success: { Icon: CheckCircle2, color: '#10b981' },
  error: { Icon: XCircle, color: '#ef4444' },
  warning: { Icon: AlertTriangle, color: '#f59e0b' },
  info: { Icon: Info, color: '#60a5fa' },
};

interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  onClose: (id: string) => void;
  /** Mantido para compatibilidade; o tamanho agora é sempre responsivo. */
  isMobile?: boolean;
}

export function Toast({ id, type, message, onClose }: ToastProps) {
  const { Icon, color } = icons[type];
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), toastOptions.duration);
    return () => clearTimeout(timer);
  }, [id, onClose]);
  return (
    <div className="ui-toast" role={type === 'error' ? 'alert' : 'status'}>
      <Icon size={20} color={color} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button type="button" onClick={() => onClose(id)} aria-label="Fechar notificação"
        className="rounded p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

interface ToastContextType {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

function show(message: string, type: ToastType = 'info') {
  if (type === 'success') { toast.success(message); return; }
  if (type === 'error') { toast.error(message); return; }
  const { Icon, color } = icons[type];
  toast(message, { icon: <Icon size={20} color={color} aria-hidden="true" /> });
}

const notifications: ToastContextType = {
  show,
  success: message => show(message, 'success'),
  error: message => show(message, 'error'),
  warning: message => show(message, 'warning'),
  info: message => show(message, 'info'),
};

export const ToastContext = React.createContext<ToastContextType | null>(null);

/** Um único host atende tanto useToast quanto as chamadas react-hot-toast existentes. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const parent = React.useContext(ToastContext);
  return (
    <ToastContext.Provider value={notifications}>
      {children}
      {!parent && <Toaster position="top-right" toastOptions={toastOptions} />}
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastContextType => {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast deve ser usado dentro de ToastProvider');
  return context;
};
