'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type ToastType = 'success' | 'error' | 'info' | 'premium';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  premium: (message: string) => void;
  openUpgradeModal: (featureName: string) => void;
  closeUpgradeModal: () => void;
  subscriptionStatus: 'free' | 'premium' | 'trial';
  setSubscriptionStatus: (status: 'free' | 'premium' | 'trial') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const supabase = React.useMemo(() => createClient(), []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState('');
  
  // Estado local sincronizado con Supabase (perfiles.subscription_status)
  const [subscriptionStatus, setSubscriptionStatus] = useState<'free' | 'premium' | 'trial'>('free');

  // Sincronización de suscripción
  useEffect(() => {
    const stored = localStorage.getItem('taxilog-sub-status') as 'free' | 'premium' | 'trial' | null;
    if (stored) {
      setSubscriptionStatus(stored);
    }

    async function syncSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_status')
            .eq('id', user.id)
            .single();
          if (profile?.subscription_status) {
            const status = profile.subscription_status as 'free' | 'premium' | 'trial';
            setSubscriptionStatus(status);
            localStorage.setItem('taxilog-sub-status', status);
          }
        }
      } catch (e) {
        console.error('Error syncing subscription:', e);
      }
    }
    void syncSubscription();
  }, [supabase]);

  const saveSubscriptionStatus = (status: 'free' | 'premium' | 'trial') => {
    setSubscriptionStatus(status);
    localStorage.setItem('taxilog-sub-status', status);
  };

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const toast = useCallback((message: string, type?: ToastType) => addToast(message, type), [addToast]);
  const success = useCallback((message: string) => addToast(message, 'success'), [addToast]);
  const error = useCallback((message: string) => addToast(message, 'error'), [addToast]);
  const info = useCallback((message: string) => addToast(message, 'info'), [addToast]);
  const premium = useCallback((message: string) => addToast(message, 'premium'), [addToast]);

  const openUpgradeModal = useCallback((featureName: string) => {
    setActiveFeature(featureName);
    setIsUpgradeOpen(true);
  }, []);

  const closeUpgradeModal = useCallback(() => {
    setIsUpgradeOpen(false);
  }, []);

  return (
    <ToastContext.Provider
      value={{
        toast,
        success,
        error,
        info,
        premium,
        openUpgradeModal,
        closeUpgradeModal,
        subscriptionStatus,
        setSubscriptionStatus: saveSubscriptionStatus,
      }}
    >
      {children}

      {/* Contenedor de Toasts Flotantes */}
      <div className="fixed bottom-24 left-1/2 z-50 flex w-full max-w-xs -translate-x-1/2 flex-col gap-2 px-4 pointer-events-none sm:max-w-sm">
        {toasts.map((t) => {
          let bgClass = 'bg-surface-2/95 border-line';
          let borderGlow = 'rgba(240, 241, 242, 0.08)';
          let icon = '🔔';
          let textColor = 'text-foreground';

          if (t.type === 'success') {
            bgClass = 'bg-[#121c17]/95 border-ok/40';
            borderGlow = 'rgba(63, 214, 139, 0.25)';
            icon = '✅';
            textColor = 'text-ok font-semibold';
          } else if (t.type === 'error') {
            bgClass = 'bg-[#221315]/95 border-bad/40';
            borderGlow = 'rgba(255, 107, 107, 0.25)';
            icon = '⚠️';
            textColor = 'text-bad font-semibold';
          } else if (t.type === 'info') {
            bgClass = 'bg-surface-2/95 border-amber/40';
            borderGlow = 'rgba(226, 35, 26, 0.2)';
            icon = '🚕';
            textColor = 'text-amber font-semibold';
          } else if (t.type === 'premium') {
            bgClass = 'bg-[#1b1424]/95 border-[#9a55ff]/40';
            borderGlow = 'rgba(154, 85, 255, 0.3)';
            icon = '👑';
            textColor = 'text-[#b380ff] font-semibold';
          }

          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 shadow-xl backdrop-blur-md transition-all duration-300 pointer-events-auto animate-toast-slide-up ${bgClass}`}
              style={{
                boxShadow: `0 8px 30px rgba(0, 0, 0, 0.6), 0 0 12px ${borderGlow}`,
              }}
            >
              <span className="text-lg flex-shrink-0">{icon}</span>
              <p className={`text-sm leading-snug ${textColor}`}>{t.message}</p>
            </div>
          );
        })}
      </div>

      {/* Modal Premium elegante (Freemium) */}
      {isUpgradeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in sm:items-center">
          <div className="card w-full max-w-sm overflow-hidden p-6 animate-sheet-slide-up flex flex-col gap-5 border-amber/30 relative">
            {/* Firma diagonal de Madrid en la esquina */}
            <div className="absolute top-0 right-0 w-24 h-24 overflow-hidden pointer-events-none">
              <div className="checker rotate-45 translate-x-8 -translate-y-4 w-32" />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="text-2xl">👑</span>
                <span className="text-xs font-bold uppercase tracking-widest text-amber">TaxiLog Premium</span>
              </div>
              <h3 className="text-xl font-extrabold tracking-tight font-[family-name:var(--font-display)]">
                Desbloquea {activeFeature || 'esta función'}
              </h3>
              <p className="text-xs text-muted leading-relaxed">
                Mejora tu plan para automatizar al máximo tus cuentas del taxi de Madrid.
              </p>
            </div>

            <hr className="border-line" />

            <div className="flex flex-col gap-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">¿Qué incluye Premium?</h4>
              <ul className="flex flex-col gap-2.5 text-sm">
                <li className="flex items-start gap-2.5">
                  <span className="text-amber">📊</span>
                  <span><strong>Informes listos en PDF:</strong> Descarga desgloses formateados para tu jefe en 1 clic.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-amber">📻</span>
                  <span><strong>Gestión de Emisoras:</strong> Registra servicios de TeleTaxi, Radioteléfono, etc.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-amber">📈</span>
                  <span><strong>Odómetro Completo:</strong> Controla kilometraje total, ocupados y vacíos de tu taxímetro.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-amber">💾</span>
                  <span><strong>Historial Ilimitado:</strong> Guarda y consulta tus acuerdos y cierres históricos.</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={async () => {
                  saveSubscriptionStatus('premium');
                  success('¡Enhorabuena! Has activado TaxiLog Premium.');
                  closeUpgradeModal();
                  try {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                      await supabase
                        .from('profiles')
                        .update({ subscription_status: 'premium' })
                        .eq('id', user.id);
                    }
                  } catch (e) {
                    console.error('Error upgrading subscription in Supabase:', e);
                  }
                }}
                className="btn-amber py-3 text-sm text-center font-bold"
              >
                Activar Plan Premium
              </button>
              <button
                onClick={closeUpgradeModal}
                className="py-2.5 text-xs text-center text-muted font-medium hover:text-foreground transition-colors"
              >
                Volver al plan Gratis
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de un ToastProvider');
  }
  return context;
}
