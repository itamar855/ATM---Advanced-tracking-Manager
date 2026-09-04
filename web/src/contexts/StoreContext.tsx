"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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

  async function loadStores() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from("stores")
        .select("id, name, shop_domain")
        .order("created_at", { ascending: true });

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
      }
    } catch (err) {
      console.error("[StoreContext]", err);
    } finally {
      setLoading(false);
    }
  }

  function setActiveStore(store: Store) {
    setActiveStoreState(store);
    if (typeof window !== "undefined") {
      localStorage.setItem("atm_active_store_id", store.id);
      document.cookie = `atm_active_store_id=${store.id}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }

  useEffect(() => { loadStores(); }, []);

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
