"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/application/auth-context";
import { Spinner } from "@/shared/ui/spinner";

export function LogoutButton() {
  const { logout } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    await logout();
    router.replace("/login");
  }, [logout, router]);

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
    >
      {loading && <Spinner className="h-4 w-4" />}
      Log out
    </button>
  );
}
