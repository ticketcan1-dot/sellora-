import "server-only";
import sharp from "sharp";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function normalizeImage(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > MAX_IMAGE_BYTES ||
    file.size === 0
  )
    throw new Error("Image JPEG, PNG ou WebP requise, de 5 Mo maximum.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const image = sharp(buffer, { limitInputPixels: 20000000, animated: false });
  const meta = await image.metadata();
  if (
    !meta.format ||
    !["jpeg", "png", "webp"].includes(meta.format) ||
    !meta.width ||
    !meta.height
  )
    throw new Error("Contenu de l’image invalide.");
  return image
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}
