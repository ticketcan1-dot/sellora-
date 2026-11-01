import type { Product } from "@/domains/catalog/schema";
import { formatMad } from "@/domains/catalog/schema";
import type { AiSettings, Interpretation } from "./schema";
const copy = {
  fr: {
    hello: "Bonjour",
    ask: "Pouvez-vous préciser le produit ou la variante recherchée ?",
    image:
      "Ces produits sont des candidats visuels, à confirmer. Une ressemblance ne garantit pas une correspondance.",
    stock: "Stock",
    unavailable:
      "Aucune référence disponible ne correspond avec certitude. Précisez votre recherche ou contactez la boutique.",
    cod: "Paiement à la livraison proposé par la boutique.",
    noCod: "Le paiement à la livraison n’est pas proposé.",
    unknown: "Information non renseignée. Contactez la boutique.",
    policies: "Les règles de livraison propres à ce produit :",
  },
  ar: {
    hello: "مرحباً",
    ask: "ما المنتج أو المقاس أو اللون الذي تبحث عنه؟",
    image:
      "هذه منتجات محتملة حسب الصورة وتحتاج إلى تأكيد. التشابه لا يضمن التطابق.",
    stock: "المخزون",
    unavailable:
      "لا يوجد تطابق مؤكد في الكتالوج. يرجى التوضيح أو التواصل مع المتجر.",
    cod: "المتجر يوفر الدفع عند الاستلام.",
    noCod: "الدفع عند الاستلام غير متوفر.",
    unknown: "هذه المعلومة غير متوفرة. يرجى التواصل مع المتجر.",
    policies: "شروط توصيل هذا المنتج:",
  },
  darija: {
    hello: "سلام",
    ask: "شنو هو المنتوج أو اللون أو القياس اللي بغيتي؟",
    image: "هادو غير اقتراحات من الصورة، خاصنا نأكدو معاك واش هو نفس المنتوج.",
    stock: "الستوك",
    unavailable:
      "ما لقيناش تطابق مؤكد فالكتالوج. وضح لينا أكثر أو تواصل مع المحل.",
    cod: "المحل كيوفر الخلاص عند التوصيل.",
    noCod: "الخلاص عند التوصيل ما متوفرش.",
    unknown: "هاد المعلومة ما مسجلاش. تواصل مع المحل.",
    policies: "شروط التوصيل ديال هاد المنتوج:",
  },
};
export function groundedReply(
  selection: Interpretation,
  products: Product[],
  settings: AiSettings,
  hasImage: boolean,
) {
  const language =
    settings.language === "auto" ? selection.language : settings.language;
  const c = copy[language];
  const candidates = products.filter(
    (p) => p.status === "active" && selection.product_ids.includes(p.id),
  );
  const invalid = selection.product_ids.some(
    (id) => !candidates.some((p) => p.id === id),
  );
  const needsHuman =
    invalid || selection.ambiguous || hasImage || selection.intent === "other";
  const hello =
    settings.tone === "concis"
      ? ""
      : `${c.hello}${settings.emoji ? " ✨" : ""} — ${settings.name}.\n\n`;
  if (selection.intent === "product" || selection.intent === "purchase") {
    if (!candidates.length || invalid)
      return {
        content: hello + c.unavailable + "\n" + settings.escalation,
        productIds: [],
        needsHuman: true,
        language,
      };
    const facts = candidates
      .map(
        (p) =>
          `${p.name}\n${p.product_variants.map((v) => `${v.name}${[v.color, v.size, v.material].filter(Boolean).length ? " · " + [v.color, v.size, v.material].filter(Boolean).join(" / ") : ""} — ${formatMad(v.price_minor)} · ${c.stock}: ${v.stock}`).join("\n")}${p.delivery_rules ? "\n" + c.policies + " " + p.delivery_rules : ""}`,
      )
      .join("\n\n");
    const clarify =
      language === "fr"
        ? settings.address === "tu"
          ? "Peux-tu préciser le produit ou la variante recherchée ?"
          : c.ask
        : c.ask;
    return {
      content:
        hello +
        (hasImage ? c.image + "\n\n" : "") +
        facts +
        (needsHuman || candidates.length > 1 ? "\n\n" + clarify : ""),
      productIds: candidates.map((p) => p.id),
      needsHuman: needsHuman || candidates.length > 1,
      language,
    };
  }
  const faq = settings.faq.split("\n").filter(Boolean);
  const policies: Record<string, string> = {
    delivery: settings.delivery,
    returns: settings.returns,
    hours: settings.hours,
    cod: settings.cod ? c.cod : c.noCod,
    discount: settings.discounts,
    faq: faq[selection.faq_index] || "",
    other: "",
  };
  const answer = policies[selection.intent] || c.unknown;
  return {
    content: hello + answer + (needsHuman ? "\n" + settings.escalation : ""),
    productIds: [],
    needsHuman: needsHuman || answer === c.unknown,
    language,
  };
}
