export function MessageText({ text }: { text: string }) {
  const parts = text.split(
    /(https?:\/\/[^\s]+\/commande\/[A-Za-z0-9_-]{43})(?=\s|$)/g,
  );
  return (
    <>
      {parts.map((part, index) => {
        try {
          const url = new URL(part);
          if (/^\/commande\/[A-Za-z0-9_-]{43}$/.test(url.pathname))
            return (
              <a
                key={index}
                href={url.pathname}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: "underline",
                  overflowWrap: "anywhere",
                }}
              >
                Ouvrir le récapitulatif privé ↗
              </a>
            );
        } catch {}
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
