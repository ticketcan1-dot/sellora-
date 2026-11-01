"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function InboxAutoRefresh({ conversation }: { conversation?: string }) {
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let version: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const editing = () =>
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName || "",
      );
    const poll = async () => {
      try {
        if (document.visibilityState === "visible" && !editing()) {
          const response = await fetch(
            "/api/inbox-version" +
              (conversation
                ? "?conversation=" + encodeURIComponent(conversation)
                : ""),
            { cache: "no-store", signal: controller.signal },
          );
          if (response.redirected) {
            const destination = new URL(response.url);
            if (
              destination.origin === window.location.origin &&
              ["/connexion", "/attente"].includes(destination.pathname)
            ) {
              window.location.replace(destination.href);
              return;
            }
          }
          if (response.ok) {
            const data = await response.json();
            if (
              active &&
              !editing() &&
              typeof data.version === "string" &&
              data.version !== version
            ) {
              version = data.version;
              router.refresh();
            }
          }
        }
      } catch {
        /* Keep the last transcript; the next poll retries without losing drafts. */
      }
      if (active) timer = setTimeout(poll, 15000);
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [conversation, router]);
  return (
    <small>
      Actualisation automatique toutes les 15 secondes, hors saisie d’un
      brouillon.
    </small>
  );
}
