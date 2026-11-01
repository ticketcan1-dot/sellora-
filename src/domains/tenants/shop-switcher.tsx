import { selectShop } from "./actions";
export function ShopSwitcher({
  memberships,
  selected,
}: {
  memberships: { organization_id: string; organizations: unknown }[];
  selected: string;
}) {
  return (
    <form action={selectShop} className="row">
      <label style={{ margin: 0 }}>
        <span className="sr-only">Boutique active</span>
        <select
          name="id"
          defaultValue={selected}
          style={{ margin: 0, minWidth: 160 }}
        >
          {memberships.map((m) => {
            const o = (
              Array.isArray(m.organizations)
                ? m.organizations[0]
                : m.organizations
            ) as { name: string };
            return (
              <option key={m.organization_id} value={m.organization_id}>
                {o.name}
              </option>
            );
          })}
        </select>
      </label>
      <button className="btn secondary small">Choisir</button>
    </form>
  );
}
