"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startWhatsApp, finishWhatsApp } from "./actions";
type FacebookSDK = {
  init: (settings: Record<string, unknown>) => void;
  login: (
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ) => void;
};
type Setup = {
  state: string;
  appId: string;
  configId: string;
  version: string;
};
export function WhatsAppButton({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function prepare() {
    if (!/^\d{6}$/.test(pin)) {
      setMessage(
        "Saisissez le code de sécurité WhatsApp à six chiffres, différent du code SMS.",
      );
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const result = await startWhatsApp();
      if (result.error || !result.state)
        throw new Error(result.error || "Connexion indisponible.");
      const w = window as Window & { FB?: FacebookSDK };
      if (!w.FB)
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://connect.facebook.net/fr_FR/sdk.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("SDK Meta indisponible."));
          document.head.appendChild(script);
        });
      if (!w.FB) throw new Error("SDK Meta indisponible.");
      w.FB.init({
        appId: result.appId,
        version: result.version,
        xfbml: false,
        cookie: false,
      });
      setSetup({
        state: result.state,
        appId: result.appId!,
        configId: result.configId!,
        version: result.version!,
      });
      setMessage(
        "Prêt. Ouvrez l’écran officiel Meta pour choisir votre compte professionnel.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Connexion indisponible.",
      );
    } finally {
      setPending(false);
    }
  }
  async function connect() {
    if (!setup) return;
    const w = window as Window & { FB?: FacebookSDK };
    if (!w.FB) {
      setSetup(null);
      return;
    }
    setPending(true);
    setMessage("");
    let cleanup = () => {};
    try {
      const assets = new Promise<{ phoneId: string; wabaId: string }>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Connexion expirée. Réessayez.")),
            300000,
          );
          const listener = (event: MessageEvent) => {
            if (
              ![
                "https://www.facebook.com",
                "https://web.facebook.com",
              ].includes(event.origin)
            )
              return;
            let data;
            try {
              data =
                typeof event.data === "string"
                  ? JSON.parse(event.data)
                  : event.data;
            } catch {
              return;
            }
            if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
            if (
              data.event === "FINISH" &&
              data.data?.phone_number_id &&
              data.data?.waba_id
            )
              resolve({
                phoneId: String(data.data.phone_number_id),
                wabaId: String(data.data.waba_id),
              });
            if (["CANCEL", "ERROR"].includes(data.event))
              reject(new Error("Connexion annulée ou refusée par Meta."));
          };
          window.addEventListener("message", listener);
          cleanup = () => {
            clearTimeout(timer);
            window.removeEventListener("message", listener);
          };
        },
      );
      // FB.login must run synchronously inside this second click, before any await,
      // so mobile browsers do not block the authorization popup.
      const code = new Promise<string>((resolve, reject) =>
        w.FB!.login(
          (response) =>
            response.authResponse?.code
              ? resolve(response.authResponse.code)
              : reject(new Error("Autorisation Meta non obtenue.")),
          {
            config_id: setup.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { setup: {}, sessionInfoVersion: "3" },
          },
        ),
      );
      const [authCode, ids] = await Promise.all([code, assets]);
      const result = await finishWhatsApp({
        state: setup.state,
        code: authCode,
        ...ids,
        pin,
      });
      if (result.error) throw new Error(result.error);
      setMessage("WhatsApp connecté après vérification officielle.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Connexion indisponible.",
      );
    } finally {
      cleanup();
      setSetup(null);
      setPin("");
      setPending(false);
    }
  }
  return (
    <div>
      <label>
        Code de sécurité WhatsApp (6 chiffres)
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          pattern="[0-9]{6}"
          value={pin}
          disabled={!enabled || pending}
          onChange={(e) => setPin(e.target.value)}
        />
      </label>
      <p style={{ fontSize: 12 }}>
        PIN de vérification en deux étapes requis pour enregistrer le numéro
        Cloud API. Utilisez le PIN existant ou choisissez-en un pour un nouveau
        numéro. Ce n’est pas le code SMS ; il est transmis à Meta sans être
        conservé par Sellora.
      </p>
      <button
        className="btn"
        disabled={!enabled || pending}
        onClick={setup ? connect : prepare}
      >
        {pending
          ? "Connexion Meta en cours…"
          : setup
            ? "Continuer chez Meta"
            : "Connecter WhatsApp Business"}
      </button>
      {message && (
        <p role="status" style={{ marginTop: 12 }}>
          {message}
        </p>
      )}
    </div>
  );
}
