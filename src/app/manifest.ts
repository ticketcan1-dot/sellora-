import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sellora AI",
    short_name: "Sellora",
    description: "Votre boutique et votre assistant commercial.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#4058d5",
    lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
