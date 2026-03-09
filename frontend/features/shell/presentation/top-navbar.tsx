"use client";

import { usePathname } from "next/navigation";

import { DashboardNavbar } from "./dashboard-navbar";

const PAGE_TITLES: Record<string, string> = {
  "/friends": "Friends",
  "/profile": "Profile",
  "/settings": "Settings",
};

export function TopNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      {pathname === "/" ? (
        <DashboardNavbar />
      ) : (
        <h1 className="text-sm font-semibold">
          {PAGE_TITLES[pathname] ?? ""}
        </h1>
      )}
    </header>
  );
}
