import { describe, it, expect } from "vitest";
import { parseMad, productSchema } from "@/domains/catalog/schema";
import { parseCsv, validateCsv } from "@/domains/catalog/csv";
describe("catalogue réel", () => {
  it.each([
    ["19,99", 1999],
    ["0", 0],
    ["125.5", 12550],
    ["9999999.99", 999999999],
  ])("convertit %s sans arrondi flottant", (input, expected) =>
    expect(parseMad(input)).toBe(expected),
  );
  it.each(["-1", "1.001", "1e4", "", "Infinity", "1 000"])(
    "rejette le montant %s",
    (v) => expect(() => parseMad(v)).toThrow(),
  );
  it("interdit les stocks négatifs et fractionnaires", () => {
    for (const stock of [-1, 1.5])
      expect(
        productSchema.safeParse({
          name: "Bague",
          variants: [{ sku: "A", name: "Or", price_minor: 100, stock }],
        }).success,
      ).toBe(false);
  });
  it("interdit les SKU dupliqués dans un produit", () =>
    expect(
      productSchema.safeParse({
        name: "Bague",
        variants: [
          { sku: "A", name: "Or", price_minor: 100, stock: 1 },
          { sku: "A", name: "Argent", price_minor: 200, stock: 2 },
        ],
      }).success,
    ).toBe(false));
  it("valide le mapping CSV et isole les erreurs sans écrasement", () => {
    const parsed = parseCsv(
      "Titre,Reference,Prix,Quantite\nBague,A,19.90,2\nCollier,A,20,3\nBracelet,B,10,-1",
    );
    const report = validateCsv(parsed.data, {
      name: "Titre",
      sku: "Reference",
      price: "Prix",
      stock: "Quantite",
    });
    expect(report.accepted).toHaveLength(1);
    expect(report.accepted[0].product.variants[0].price_minor).toBe(1990);
    expect(report.errors.map((e) => e.row)).toEqual([3, 4]);
  });
});
