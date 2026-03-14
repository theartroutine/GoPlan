"use client";

import type { ReactNode } from "react";

import { AuthGuard } from "@/features/auth/presentation/auth-guard";
import { NotificationsProvider } from "@/features/notifications/application/notifications-context";
import { SidebarProvider } from "@/features/shell/application/sidebar-context";
import { TooltipProvider } from "@/shared/ui/tooltip";

import { Sidebar } from "./sidebar";
import { TopNavbar } from "./top-navbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <NotificationsProvider>
        <TooltipProvider delayDuration={0}>
          <SidebarProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <TopNavbar />
                <main className="flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </NotificationsProvider>
    </AuthGuard>
  );
}
