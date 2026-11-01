import { formatMad } from "@/domains/catalog/schema";
export function ActivityChart({
  series,
}: {
  series: {
    day: string;
    orders: number;
    revenue_minor: number;
    conversations: number;
  }[];
}) {
  const peak = Math.max(1, ...series.map((s) => s.revenue_minor));
  const total = series.reduce((sum, s) => sum + s.revenue_minor, 0);
  return (
    <figure style={{ margin: 0 }}>
      <figcaption>
        <strong>{formatMad(total)}</strong>
        <small> · montant confirmé sur 30 jours (Maroc)</small>
      </figcaption>
      <div
        role="img"
        aria-label={`Montant des commandes confirmées sur trente jours : ${formatMad(total)}. Simulations exclues.`}
        style={{
          height: 180,
          display: "flex",
          alignItems: "end",
          gap: 3,
          borderBottom: "1px solid var(--border)",
          paddingTop: 20,
        }}
      >
        {series.map((s) => (
          <div
            key={s.day}
            title={`${s.day} · ${s.orders} commandes · ${formatMad(s.revenue_minor)} · ${s.conversations} conversations`}
            style={{
              flex: 1,
              minWidth: 2,
              height: s.revenue_minor
                ? Math.max(3, (s.revenue_minor / peak) * 150)
                : 1,
              background: s.revenue_minor ? "#4058d5" : "#e6e9ef",
              borderRadius: "3px 3px 0 0",
            }}
          />
        ))}
      </div>
      <div className="row between" style={{ marginTop: 6 }}>
        <small>{series[0]?.day}</small>
        <small>{series.at(-1)?.day}</small>
      </div>
    </figure>
  );
}
