"use client";
import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Plus, Search, Upload, ImagePlus, Trash2, Pencil } from "lucide-react";
import {
  saveProduct,
  deleteProduct,
  uploadProductImage,
  removeProductImage,
} from "./actions";
import { type Product, type Variant, parseMad, formatMad } from "./schema";
import { csvFields, parseCsv, validateCsv, type CsvMapping } from "./csv";
import { Empty, Notice } from "@/components/ui";
const blankVariant = {
  sku: "",
  name: "Standard",
  color: "",
  size: "",
  material: "",
  price_minor: 0,
  stock: 0,
};
function ProductEditor({
  product,
  onClose,
  onNotice,
}: {
  product?: Product;
  onClose: () => void;
  onNotice: (m: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [variants, setVariants] = useState<Variant[]>(
    product?.product_variants || [{ ...blankVariant }],
  );
  function submit(form: FormData) {
    start(async () => {
      setError("");
      try {
        const result = await saveProduct(
          {
            name: form.get("name"),
            description_fr: form.get("description_fr"),
            description_ar: form.get("description_ar"),
            category: form.get("category"),
            status: form.get("status"),
            tags: String(form.get("tags"))
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            visual_attributes: form.get("visual_attributes"),
            delivery_rules: form.get("delivery_rules"),
            variants,
          },
          product?.id,
        );
        if (result.error) {
          setError(result.error);
          return;
        }
        onNotice("Produit enregistré dans votre boutique.");
        onClose();
        router.refresh();
      } catch {
        setError(
          "Enregistrement impossible. Vérifiez les champs et votre accès.",
        );
      }
    });
  }
  function update(index: number, key: string, value: string | number) {
    setVariants((vs) =>
      vs.map((v, i) => (i === index ? { ...v, [key]: value } : v)),
    );
  }
  return (
    <section className="card" id="editor">
      <div className="row between">
        <h2>{product ? "Modifier le produit" : "Nouveau produit"}</h2>
        <button className="btn secondary small" onClick={onClose}>
          Fermer
        </button>
      </div>
      <Notice message={error} />
      <form action={submit}>
        <div className="grid cols2">
          <label>
            Nom du produit
            <input
              name="name"
              required
              minLength={2}
              maxLength={160}
              defaultValue={product?.name}
            />
          </label>
          <label>
            Catégorie
            <input
              name="category"
              maxLength={100}
              defaultValue={product?.category}
            />
          </label>
          <label>
            Description française
            <textarea
              name="description_fr"
              maxLength={4000}
              defaultValue={product?.description_fr}
            />
          </label>
          <label>
            Description arabe
            <textarea
              name="description_ar"
              dir="rtl"
              lang="ar"
              maxLength={4000}
              defaultValue={product?.description_ar}
            />
          </label>
          <label>
            Statut
            <select name="status" defaultValue={product?.status || "active"}>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </label>
          <label>
            Tags (séparés par des virgules)
            <input name="tags" defaultValue={product?.tags.join(", ")} />
          </label>
          <label>
            Attributs visuels
            <textarea
              name="visual_attributes"
              maxLength={1000}
              defaultValue={product?.visual_attributes}
              placeholder="Forme, texture, détails distinctifs…"
            />
          </label>
          <label>
            Règles de livraison du produit
            <textarea
              name="delivery_rules"
              maxLength={1000}
              defaultValue={product?.delivery_rules}
            />
          </label>
        </div>
        <h3>Variantes · prix en MAD, stock à l’unité</h3>
        {variants.map((v, i) => (
          <fieldset key={i}>
            <legend>Variante {i + 1}</legend>
            <div className="grid cols3">
              <label>
                SKU unique
                <input
                  value={v.sku}
                  required
                  maxLength={80}
                  onChange={(e) => update(i, "sku", e.target.value)}
                />
              </label>
              <label>
                Nom de variante
                <input
                  value={v.name}
                  required
                  maxLength={100}
                  onChange={(e) => update(i, "name", e.target.value)}
                />
              </label>
              <label>
                Prix MAD
                <input
                  key={`${product?.id}-${i}-price`}
                  defaultValue={(v.price_minor / 100).toFixed(2)}
                  inputMode="decimal"
                  required
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  onChange={(e) => {
                    try {
                      update(i, "price_minor", parseMad(e.target.value));
                      e.target.setCustomValidity("");
                    } catch {
                      e.target.setCustomValidity(
                        "Prix invalide, deux décimales maximum.",
                      );
                    }
                  }}
                />
              </label>
              <label>
                Stock
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step={1}
                  required
                  value={v.stock}
                  onChange={(e) => update(i, "stock", Number(e.target.value))}
                />
              </label>
              <label>
                Couleur
                <input
                  value={v.color}
                  maxLength={80}
                  onChange={(e) => update(i, "color", e.target.value)}
                />
              </label>
              <label>
                Taille
                <input
                  value={v.size}
                  maxLength={80}
                  onChange={(e) => update(i, "size", e.target.value)}
                />
              </label>
              <label>
                Matière
                <input
                  value={v.material}
                  maxLength={80}
                  onChange={(e) => update(i, "material", e.target.value)}
                />
              </label>
            </div>
            {!v.id && variants.length > 1 && (
              <button
                type="button"
                className="btn danger small"
                onClick={() =>
                  setVariants((vs) => vs.filter((_, n) => n !== i))
                }
              >
                Retirer cette nouvelle variante
              </button>
            )}
            {v.id && (
              <small>
                Une variante existante est conservée pour préserver ses
                références. Mettez son stock à zéro si nécessaire.
              </small>
            )}
          </fieldset>
        ))}
        <div className="row">
          <button
            type="button"
            className="btn secondary"
            disabled={variants.length >= 100}
            onClick={() => setVariants((v) => [...v, { ...blankVariant }])}
          >
            <Plus size={15} />
            Ajouter une variante
          </button>
          <button className="btn" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le produit"}
          </button>
        </div>
      </form>
    </section>
  );
}
function CsvImporter({ onNotice }: { onNotice: (m: string) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [error, setError] = useState("");
  const [report, setReport] = useState("");
  const [pending, start] = useTransition();
  const preview = validateCsv(rows, mapping);
  async function read(file?: File) {
    setRows([]);
    setReport("");
    setError("");
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError("CSV limité à 1 Mo et 500 lignes.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.errors.length || parsed.data.length > 500) {
      setError(
        "CSV invalide ou supérieur à 500 lignes. Vérifiez les séparateurs et les colonnes.",
      );
      return;
    }
    const fields = parsed.meta.fields || [];
    setHeaders(fields);
    setMapping(
      Object.fromEntries(
        csvFields.map((f) => [f, fields.includes(f) ? f : ""]),
      ),
    );
    setRows(parsed.data);
  }
  function importAll() {
    start(async () => {
      let success = 0;
      const failures: string[] = [];
      for (const item of preview.accepted) {
        try {
          const result = await saveProduct(item.product);
          if (result.error) failures.push(`Ligne ${item.row}: ${result.error}`);
          else success++;
        } catch {
          failures.push(`Ligne ${item.row}: erreur d’accès ou de connexion`);
        }
      }
      setReport(
        `${success} produit(s) créé(s). ${failures.length} échec(s).\n${failures.join("\n")}`,
      );
      setRows([]);
      onNotice(
        "Import terminé. Consultez le rapport ; aucun produit existant n’a été écrasé.",
      );
      router.refresh();
    });
  }
  return (
    <details className="card">
      <summary>
        <Upload
          size={16}
          style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }}
        />
        Importer un catalogue CSV
      </summary>
      <p>
        Une ligne crée un produit avec une variante. Prix en MAD, stock entier.
        Les SKU existants sont rejetés, jamais écrasés.
      </p>
      <a className="btn secondary small" href="/catalogue-exemple.csv" download>
        Télécharger le modèle
      </a>
      <label style={{ marginTop: 14 }}>
        Fichier CSV (1 Mo, 500 lignes maximum)
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={pending}
          onChange={(e) => read(e.target.files?.[0])}
        />
      </label>
      <Notice message={error} />
      {headers.length > 0 && rows.length > 0 && (
        <>
          <div className="grid cols3">
            {csvFields.map((f) => (
              <label key={f}>
                {f}
                {["name", "sku", "price", "stock"].includes(f) ? " *" : ""}
                <select
                  disabled={pending}
                  value={mapping[f] || ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f]: e.target.value }))
                  }
                >
                  <option value="">Non associé</option>
                  {headers.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <h3>
            Aperçu · {preview.accepted.length} lignes valides / {rows.length}
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Produit</th>
                  <th>SKU</th>
                  <th>Prix</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {preview.accepted.slice(0, 5).map((x) => (
                  <tr key={x.row}>
                    <td>{x.row}</td>
                    <td>{x.product.name}</td>
                    <td>{x.product.variants[0].sku}</td>
                    <td>{formatMad(x.product.variants[0].price_minor)}</td>
                    <td>{x.product.variants[0].stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.errors.length > 0 && (
            <details>
              <summary>
                {preview.errors.length} ligne(s) invalide(s), exclues de
                l’import
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
                {preview.errors
                  .map((e) => `Ligne ${e.row}: ${e.message}`)
                  .join("\n")}
              </pre>
            </details>
          )}
          <button
            className="btn"
            disabled={pending || !preview.accepted.length}
            onClick={importAll}
          >
            {pending
              ? "Import en cours…"
              : `Créer les ${preview.accepted.length} produits valides`}
          </button>
        </>
      )}
      {report && (
        <pre role="status" style={{ whiteSpace: "pre-wrap" }}>
          {report}
        </pre>
      )}
    </details>
  );
}
export function CatalogManager({
  products,
  canEdit,
}: {
  products: Product[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const [pending, start] = useTransition();
  const filtered = products.filter(
    (p) =>
      `${p.name} ${p.description_fr} ${p.description_ar} ${p.category} ${p.tags.join(" ")} ${p.product_variants.map((v) => v.sku).join(" ")}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()) &&
      (status === "all" || p.status === status) &&
      (category === "all" || p.category === category) &&
      (stock === "all" ||
        p.product_variants.some((v) =>
          stock === "yes" ? v.stock > 0 : v.stock === 0,
        )),
  );
  function remove(p: Product) {
    if (!window.confirm(`Supprimer « ${p.name} » et ses photos ?`)) return;
    start(async () => {
      const result = await deleteProduct(p.id);
      setNotice(result.error || "Produit supprimé.");
      router.refresh();
    });
  }
  function upload(form: FormData) {
    start(async () => {
      const result = await uploadProductImage(form);
      setNotice(result.error || "Photo enregistrée.");
      router.refresh();
    });
  }
  return (
    <div className="stack">
      <Notice message={notice} />
      {canEdit && (
        <div className="row">
          <button className="btn" onClick={() => setEditing(null)}>
            <Plus size={16} />
            Ajouter un produit
          </button>
          <small>Prix et stocks enregistrés dans votre boutique.</small>
        </div>
      )}
      {editing !== undefined && canEdit && (
        <ProductEditor
          key={editing?.id || "new"}
          product={editing || undefined}
          onClose={() => setEditing(undefined)}
          onNotice={setNotice}
        />
      )}
      <section className="card">
        <div className="grid cols4">
          <label>
            <span className="row">
              <Search size={14} />
              Rechercher
            </span>
            <input
              placeholder="Nom, SKU, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Statut
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Tous</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
          </label>
          <label>
            Catégorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="all">Toutes</option>
              {[
                ...new Set(products.map((p) => p.category).filter(Boolean)),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Disponibilité
            <select value={stock} onChange={(e) => setStock(e.target.value)}>
              <option value="all">Tous les stocks</option>
              <option value="yes">Avec du stock</option>
              <option value="no">Au moins une rupture</option>
            </select>
          </label>
        </div>
        <small>{filtered.length} produit(s) affiché(s)</small>
      </section>
      {!filtered.length ? (
        <section className="card">
          <Empty
            title={
              products.length
                ? "Aucun résultat"
                : "Votre catalogue attend ses premiers produits"
            }
          >
            {products.length
              ? "Essayez un autre filtre."
              : "Ajoutez un produit avec un prix, un stock et une photo pour donner du contexte à votre assistant."}
          </Empty>
        </section>
      ) : (
        <div className="grid cols3">
          {filtered.map((p) => (
            <article className="card" key={p.id}>
              <div className="row between">
                <span
                  className={`badge ${p.status === "active" ? "green" : ""}`}
                >
                  {p.status === "active" ? "Actif" : "Inactif"}
                </span>
                <small>{p.category || "Sans catégorie"}</small>
              </div>
              {/* Signed private image URLs are intentionally rendered directly. */}
              {p.product_images[0]?.url && (
                <Image
                  unoptimized
                  width={400}
                  height={220}
                  src={p.product_images[0].url}
                  alt={p.name}
                  className="product-photo"
                  style={{ marginTop: 16 }}
                />
              )}
              <h2 style={{ marginTop: 16 }}>{p.name}</h2>
              <p>{p.description_fr.slice(0, 140) || "Aucune description"}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Variante</th>
                      <th>Prix MAD</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.product_variants.map((v) => (
                      <tr key={v.id || v.sku}>
                        <td>
                          {v.name}
                          <br />
                          <small>{v.sku}</small>
                        </td>
                        <td>{formatMad(v.price_minor)}</td>
                        <td>
                          <span
                            className={`badge ${v.stock ? "green" : "amber"}`}
                          >
                            {v.stock}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <>
                  <div className="row" style={{ marginTop: 18 }}>
                    <button
                      className="btn secondary small"
                      disabled={pending}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil size={13} />
                      Modifier
                    </button>
                    <button
                      className="btn danger small"
                      disabled={pending}
                      onClick={() => remove(p)}
                    >
                      <Trash2 size={13} />
                      Supprimer
                    </button>
                  </div>
                  <details>
                    <summary>Photos ({p.product_images.length})</summary>
                    <div className="row">
                      {p.product_images.map((img) => (
                        <div key={img.id}>
                          {img.url && (
                            <Image
                              unoptimized
                              width={110}
                              height={110}
                              className="preview"
                              src={img.url}
                              alt={p.name}
                            />
                          )}
                          <button
                            aria-label="Supprimer cette photo"
                            disabled={pending}
                            className="btn danger small"
                            onClick={() =>
                              start(async () => {
                                const result = await removeProductImage(img.id);
                                setNotice(result.error || "Photo supprimée.");
                                router.refresh();
                              })
                            }
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <form action={upload}>
                      <input type="hidden" name="product_id" value={p.id} />
                      <label>
                        JPEG, PNG ou WebP · 5 Mo max.
                        <input
                          name="image"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          required
                        />
                      </label>
                      <button
                        className="btn secondary small"
                        disabled={pending}
                      >
                        <ImagePlus size={14} />
                        Ajouter une photo
                      </button>
                    </form>
                  </details>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {canEdit && <CsvImporter onNotice={setNotice} />}
    </div>
  );
}
