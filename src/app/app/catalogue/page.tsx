import { PageHead } from "@/components/ui";
import { CatalogManager } from "@/domains/catalog/catalog-manager";
import { catalogForCurrentShop } from "@/domains/catalog/queries";
export default async function Page() {
  const { organization, role, products } = await catalogForCurrentShop();
  return (
    <>
      <PageHead
        title="Votre catalogue"
        description={`${organization.name} · Une source fiable pour vos produits, vos prix et vos stocks.`}
      >
        <span className="badge">MAD · Données privées</span>
      </PageHead>
      <CatalogManager
        products={products}
        canEdit={["owner", "admin"].includes(role)}
      />
    </>
  );
}
