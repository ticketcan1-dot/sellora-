"use client";
import { useEffect, useState } from "react";
export function ApprovalWatcher() {
  const [message, setMessage] = useState(
    "Vérification automatique de la décision administrateur…",
  );
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch("/api/account-status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 401) {
          setMessage(
            "Votre session a expiré. Reconnectez-vous pour reprendre la vérification.",
          );
          return;
        }
        if (!response.ok) throw new Error("status unavailable");
        const data = await response.json();
        if (data.status === "approved") {
          window.location.replace("/app");
          return;
        }
        setMessage(
          data.status === "rejected"
            ? "L’accès a été refusé ou retiré. Contactez l’administrateur."
            : "Votre compte est en attente de confirmation par l’administrateur. Cette page s’ouvrira automatiquement après approbation.",
        );
      } catch {
        if (!active) return;
        setMessage(
          "La vérification est momentanément indisponible. Nouvelle tentative automatique…",
        );
      }
      if (active) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return (
    <p role="status" aria-live="polite">
      {message}
    </p>
  );
}
