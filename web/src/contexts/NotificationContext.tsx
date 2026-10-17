"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { playNotificationSound } from "@/lib/notifications/sound-effects";
import { NotificationToast, ToastNotification } from "@/components/notifications/NotificationToast";

export interface NotificationRecord {
  id: string;
  store_id: string;
  order_id: string;
  type: "approved" | "pending";
  title: string;
  body: string;
  value: number;
  currency: string;
  payment_method?: string;
  customer_name?: string;
  items_summary?: string;
  read: boolean;
  metadata?: Record<string, any>;
  created_at: string;
}

interface NotificationContextType {
  notifications: NotificationRecord[];
  unreadCount: number;
  loading: boolean;
  activeToast: ToastNotification | null;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  dismissToast: () => void;
  reload: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  loading: false,
  activeToast: null,
  markAsRead: async () => {},
  markAllAsRead: async () => {},
  dismissToast: () => {},
  reload: async () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { activeStore } = useStore();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeToast, setActiveToast] = useState<ToastNotification | null>(null);
  const activeStoreIdRef = useRef<string | null>(null);

  const loadNotifications = useCallback(async () => {
    if (!activeStore?.id) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("store_id", activeStore.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        // Se a tabela ainda não tiver sido criada ou sincronizada no schema cache
        console.warn("[NotificationContext] Consulta inicial de notificações:", error.message);
        return;
      }

      if (data) {
        setNotifications(data as NotificationRecord[]);
        const unread = data.filter((n: any) => !n.read).length;
        setUnreadCount(unread);
      }
    } catch (err: any) {
      console.error("[NotificationContext Load Error]:", err);
    } finally {
      setLoading(false);
    }
  }, [activeStore?.id]);

  // Carrega ao mudar de loja
  useEffect(() => {
    activeStoreIdRef.current = activeStore?.id || null;
    void loadNotifications();
  }, [activeStore?.id, loadNotifications]);

  // Sincroniza silenciosamente a inscrição Web Push do aparelho caso permissão já esteja concedida
  useEffect(() => {
    const storeId = activeStore?.id;
    if (!storeId || typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
      return;
    }

    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready.then(async (reg) => {
        try {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const rawSub = sub.toJSON();
            if (rawSub.endpoint && rawSub.keys) {
              const ua = navigator.userAgent.toLowerCase();
              let deviceType: "ios" | "android" | "desktop" = "desktop";
              let deviceName = "Computador / Desktop";
              if (/iphone|ipad|ipod/.test(ua)) {
                deviceType = "ios";
                deviceName = "Apple iPhone / iPad";
              } else if (/android/.test(ua)) {
                deviceType = "android";
                deviceName = "Smartphone Android";
              }

              await fetch("/api/v1/notifications/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  store_id: storeId,
                  subscription: rawSub,
                  device_name: deviceName,
                  device_type: deviceType,
                }),
              });
            }
          }
        } catch {
          // Silencioso se o SW ainda não estiver pronto
        }
      });
    }
  }, [activeStore?.id]);

  // Escuta mensagens disparadas pelo Service Worker (quando aba estiver aberta)
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "ATM_PUSH_RECEIVED" && event.data?.payload) {
        const payload = event.data.payload;
        try {
          const soundName = payload.data?.type === "pending" ? "safe_coins" : "chaching";
          playNotificationSound(soundName);
        } catch {}
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  // Inscrição no Supabase Realtime (postgres_changes na tabela notifications)
  useEffect(() => {
    const storeId = activeStore?.id;
    if (!storeId) return;

    const supabase = createClient();
    const channelName = `realtime:notifications:${storeId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const newRow = payload.new as NotificationRecord;

          // Atualiza lista em memória deduplicada
          setNotifications((prev) => {
            if (prev.some((item) => item.id === newRow.id)) return prev;
            return [newRow, ...prev];
          });

          // Incrementa contador se não lida
          if (!newRow.read) {
            setUnreadCount((c) => c + 1);
          }

          // Dispara áudio (chaching para aprovada, coin para pendente)
          try {
            const soundName = newRow.type === "approved" ? "chaching" : "safe_coins";
            playNotificationSound(soundName);
          } catch {}

          // Dispara Toast visual
          setActiveToast({
            id: newRow.id,
            type: newRow.type,
            title: newRow.title,
            body: newRow.body,
            value: Number(newRow.value || 0),
            paymentMethod: newRow.payment_method,
            customerName: newRow.customer_name,
            createdAt: newRow.created_at,
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `store_id=eq.${storeId}`,
        },
        (payload) => {
          const updated = payload.new as NotificationRecord;
          setNotifications((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item))
          );
          setNotifications((curr) => {
            setUnreadCount(curr.filter((n) => !n.read).length);
            return curr;
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeStore?.id]);

  const markAsRead = useCallback(
    async (id: string) => {
      // Otimista
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));

      const supabase = createClient();
      try {
        await supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", id);
      } catch (err) {
        console.error("[NotificationContext] Erro ao marcar notificação como lida:", err);
      }
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    const storeId = activeStore?.id;
    if (!storeId) return;

    // Otimista
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    const supabase = createClient();
    try {
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("store_id", storeId)
        .eq("read", false);
    } catch (err) {
      console.error("[NotificationContext] Erro ao marcar todas como lidas:", err);
    }
  }, [activeStore?.id]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        activeToast,
        markAsRead,
        markAllAsRead,
        dismissToast,
        reload: loadNotifications,
      }}
    >
      {children}
      <NotificationToast
        toast={activeToast}
        onDismiss={() => setActiveToast(null)}
      />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
