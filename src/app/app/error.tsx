"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="card" role="alert">
      <h1>Votre espace est momentanément indisponible.</h1>
      <p>
        Vérifiez votre connexion. Si le problème persiste, contactez
        l’administrateur pour vérifier la configuration et les migrations.
      </p>
      <button className="btn" onClick={reset}>
        Réessayer
      </button>
    </section>
  );
}
