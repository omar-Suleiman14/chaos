import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Chaos",
    short_name: "Chaos",
    description: "Learn, teach, build quizzes and forms with Chaos.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#171716",
    theme_color: "#171716",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
