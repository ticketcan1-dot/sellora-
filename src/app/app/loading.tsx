export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Chargement de votre espace"
      className="stack"
    >
      <div className="loading" />
      <div className="grid cols3">
        <div className="loading" />
        <div className="loading" />
        <div className="loading" />
      </div>
      <div className="loading" style={{ height: 300 }} />
    </div>
  );
}
