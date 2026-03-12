"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const STORAGE_KEY = "goplan:sidebar";

type SidebarContextValue = {
  isCollapsed: boolean;
  toggle: () => void;
  isMobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

// Simple external store backed by localStorage
let listeners: Array<() => void> = [];

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function getServerSnapshot(): boolean {
  return false;
}

function setCollapsed(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, String(value));
  for (const listener of listeners) {
    listener();
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const isCollapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed(!getSnapshot());
  }, []);

  const openMobile = useCallback(() => {
    setIsMobileOpen(true);
  }, []);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const value = useMemo(
    () => ({ isCollapsed, toggle, isMobileOpen, openMobile, closeMobile }),
    [isCollapsed, toggle, isMobileOpen, openMobile, closeMobile],
  );

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
