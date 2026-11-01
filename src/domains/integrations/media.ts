import "server-only";
import { graphRequest } from "./meta-api";
import { normalizeImage, MAX_IMAGE_BYTES } from "@/domains/catalog/images";
import { z } from "zod";
function allowedHost(host: string) {
  return ["fbcdn.net", "cdninstagram.com", "fbsbx.com"].some(
    (domain) => host === domain || host.endsWith("." + domain),
  );
}
export async function downloadMetaImage(
  media: { provider: "instagram" | "whatsapp"; id?: string; url?: string },
  token: string,
) {
  let url = media.url;
  if (media.provider === "whatsapp") {
    const info = await graphRequest(
      "whatsapp",
      z.string().regex(/^\d+$/).parse(media.id),
      token,
    );
    url = z.string().url().parse(info.url);
  }
  if (!url) throw new Error("Image unavailable");
  for (let redirects = 0; redirects < 3; redirects++) {
    const parsed: URL = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !allowedHost(parsed.hostname)
    )
      throw new Error("Image host not allowed");
    const response: Response = await fetch(parsed, {
      headers:
        media.provider === "whatsapp"
          ? { Authorization: "Bearer " + token }
          : {},
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      url = new URL(response.headers.get("location") || "", parsed).href;
      continue;
    }
    if (
      !response.ok ||
      Number(response.headers.get("content-length") || 0) > MAX_IMAGE_BYTES
    )
      throw new Error("Image unavailable or too large");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Image unavailable");
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_IMAGE_BYTES) throw new Error("Image too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = Buffer.concat(chunks);
    const contentType =
      response.headers.get("content-type")?.split(";")[0] || "";
    return normalizeImage(
      new File([new Uint8Array(bytes)], "incoming-image", {
        type: contentType,
      }),
    );
  }
  throw new Error("Too many image redirects");
}
