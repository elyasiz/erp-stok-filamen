"use client";

import { useEffect, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import type { ReportsData } from "@/lib/report-data";

export function useReports(view: string, enabled = true) {
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      const request = controller;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/v1/reports", { cache: "no-store", signal: request.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? "Data gagal dimuat.");
        if (active && !request.signal.aborted) setData(payload);
      } catch (failure) {
        if (active && !request.signal.aborted) {
          setData(null);
          setError(failure instanceof Error ? failure.message : "Data gagal dimuat.");
        }
      } finally {
        if (active && !request.signal.aborted) setLoading(false);
      }
    };
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    void load();
    window.addEventListener("focus", refreshVisible);
    const interval = window.setInterval(refreshVisible, 60_000);
    return () => { active = false; controller?.abort(); window.removeEventListener("focus", refreshVisible); window.clearInterval(interval); };
  }, [view, revision, enabled]);
  return { data, error, loading, reload: () => setRevision((value) => value + 1) };
}

export type ReportState = ReturnType<typeof useReports>;
export const formatNumber = (value: number) => value.toLocaleString("id-ID", { maximumFractionDigits: 2 });
export const formatKg = (grams: number) => `${(grams / 1000).toLocaleString("id-ID", { maximumFractionDigits: 5 })} kg`;
export const formatMoney = (value: number | null) => value === null ? "Belum tersedia" : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
export const formatDate = (date: string, time = true) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(new Date(date));

export function ReportLoadState({ state }: { state: ReportState }) {
  if (state.error) return <div className="inventory-load-error" role="alert"><AlertCircle size={18} /><span>{state.error}</span><button className="button secondary" onClick={state.reload}>Coba lagi</button></div>;
  return <div className="report-empty" role="status"><LoaderCircle className="spin" size={20} /> Memuat data terbaru...</div>;
}

export function ReportRefresh({ state }: { state: ReportState }) {
  return <button className="button secondary" onClick={state.reload} disabled={state.loading}><LoaderCircle size={17} className={state.loading ? "spin" : ""} /> Muat ulang</button>;
}
