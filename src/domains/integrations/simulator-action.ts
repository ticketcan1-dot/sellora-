"use server";
import { z } from "zod";
import { tenant } from "@/domains/tenants/access";
import { serviceDb } from "@/lib/supabase/server";
import { normalizeImage } from "@/domains/catalog/images";
import { finish } from "@/lib/forms";
export async function simulateWebhook(form: FormData) {
  const { organization } = await tenant(["owner", "admin", "agent"]);
  const provider = z
    .enum(["instagram", "whatsapp"])
    .parse(form.get("provider"));
  const text = z
    .string()
    .trim()
    .min(1)
    .max(3000)
    .safeParse(form.get("content"));
  if (!text.success)
    finish(
      "/app/canaux",
      "Ajoutez un message de test de 3 000 caractères maximum.",
    );
  const file = form.get("image");
  let image: Buffer | undefined;
  if (file instanceof File && file.size) {
    try {
      image = await normalizeImage(file);
    } catch {
      finish(
        "/app/canaux",
        "Image de test invalide : JPEG, PNG ou WebP, 5 Mo maximum.",
      );
    }
  }
  const client = serviceDb();
  const { data: thread, error } = await client
    .from("conversations")
    .insert({
      organization_id: organization.id,
      source: "simulation",
      is_simulation: true,
      subject: "Webhook " + provider + " — SIMULATION",
      last_inbound_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) finish("/app/canaux", "La simulation n’a pas pu être créée.");
  const id = crypto.randomUUID();
  const path = image ? `${organization.id}/${id}.webp` : null;
  if (image && path) {
    const { error } = await client.storage
      .from("simulation")
      .upload(path, image, { contentType: "image/webp" });
    if (error) {
      await client
        .from("conversations")
        .delete()
        .eq("organization_id", organization.id)
        .eq("id", thread.id);
      finish("/app/canaux", "Image non enregistrée. Simulation annulée.");
    }
  }
  const { error: me } = await client.from("messages").insert({
    id,
    organization_id: organization.id,
    conversation_id: thread.id,
    role: "user",
    content: text.data,
    image_path: path,
    direction: "internal",
  });
  if (me) {
    if (path) await client.storage.from("simulation").remove([path]);
    await client
      .from("conversations")
      .delete()
      .eq("organization_id", organization.id)
      .eq("id", thread.id);
    finish("/app/canaux", "Simulation annulée : message non enregistré.");
  }
  finish(
    "/app/conversations?id=" + thread.id,
    "Événement simulé créé dans un fil isolé. Aucun compte Meta n’a été connecté et aucun message réel n’a été reçu ou envoyé.",
  );
}
