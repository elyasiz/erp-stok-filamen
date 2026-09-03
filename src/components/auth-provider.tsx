"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { AppUser } from "@/lib/account-types";

type AuthState = { user: AppUser | null; loading: boolean; error: string; configured: boolean; googleClientId: string | null; refresh: () => Promise<void>; signedIn: (user: AppUser) => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [config, setConfig] = useState({ configured: false, googleClientId: null as string | null });
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/auth/me", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Akun belum dapat dimuat.");
      setUser(body.user); setConfig({ configured: body.configured, googleClientId: body.googleClientId }); setError("");
    } catch(failure) { setUser(null); setError(failure instanceof Error ? failure.message : "Koneksi terputus."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const startup = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(onFocus, 60_000);
    return () => { window.clearTimeout(startup); window.removeEventListener("focus", onFocus); window.clearInterval(timer); };
  }, [refresh]);
  const logout = async () => {
    const response = await fetch("/api/v1/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error("Belum dapat keluar. Silakan coba lagi.");
    setUser(null);
  };
  return <AuthContext.Provider value={{ user, loading, error, ...config, refresh, signedIn: setUser, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("AuthProvider is required");
  return state;
}
