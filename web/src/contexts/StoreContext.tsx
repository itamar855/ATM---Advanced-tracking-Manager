"use client";

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { playNotificationSound } from "@/lib/notifications/sound-effects";

interface Store {
  id: string;
  name: string;
  shop_domain?: string;
  platform?: string;
}

interface StoreContextType {
  stores: Store[];
  activeStore: Store | null;
  setActiveStore: (store: Store) => void;
  loading: boolean;
  reload: () => void;
}

const StoreContext = createContext<StoreContextType>({
  stores: [],
  activeStore: null,
  setActiveStore: () => {},
  loading: true,
  reload: () => {},
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStoreState] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const isFetchingRef = useRef(false);

  const loadStores = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    const supabase = createClient();
    try {
      // 1. Obtém sessão: prioriza getSession local rápida e faz fallback para getUser
      const { data: sessionData } = await supabase.auth.getSession();
      let user = sessionData?.session?.user || null;

      if (!user) {
        const { data: userData } = await supabase.auth.getUser();
        user = userData?.user || null;
      }

      // Se não houver usuário autenticado, mantém isolamento multi-tenant estrito
      if (!user) {
        if (isMountedRef.current) {
          lastLoadedUserIdRef.current = null;
          setLoading(false);
        }
        return;
      }

      // 2. Consulta lojas protegida por RLS (Postgres: tenant_id = auth.uid())
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[StoreContext] Error loading stores:", error);
      } else if (isMountedRef.current) {
        lastLoadedUserIdRef.current = user.id;
        if (data && data.length > 0) {
          setStores(data);

          // Retoma loja salva no localStorage
          const savedId = typeof window !== "undefined" ? localStorage.getItem("atm_active_store_id") : null;
          const saved = savedId ? data.find((s) => s.id === savedId) : null;
          const initialStore = saved || data[0];
          setActiveStoreState(initialStore);
          if (typeof window !== "undefined") {
            document.cookie = `atm_active_store_id=${initialStore.id}; path=/; max-age=31536000; SameSite=Lax`;
          }
        } else {
          setStores([]);
          setActiveStoreState(null);
        }
      }
    } catch (err) {
      console.error("[StoreContext]", err);
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  function setActiveStore(store: Store) {
    setActiveStoreState(store);
    if (typeof window !== "undefined") {
      localStorage.setItem("atm_active_store_id", store.id);
      document.cookie = `atm_active_store_id=${store.id}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }

  // 1. Carga inicial garantida no mount
  useEffect(() => {
    isMountedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStores();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadStores]);

  // 2. Listener reativo para eventos posteriores de autenticação (login, logout, refresh)
  useEffect(() => {
    const supabase = createClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return;

      if (event === "SIGNED_IN") {
        void loadStores();
      } else if (event === "TOKEN_REFRESHED") {
        if (session?.user?.id && session.user.id !== lastLoadedUserIdRef.current) {
          void loadStores();
        }
      } else if (event === "SIGNED_OUT") {
        lastLoadedUserIdRef.current = null;
        setStores([]);
        setActiveStoreState(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadStores]);

  // Listener para som de notificação push via Service Worker
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "ATM_PUSH_RECEIVED") {
        const sound = event.data?.sound || "/sounds/chaching.wav";
        playNotificationSound(sound);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <StoreContext.Provider value={{ stores, activeStore, setActiveStore, loading, reload: loadStores }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}
