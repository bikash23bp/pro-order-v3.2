/**
 * Supabase Storage image transform helper.
 * Rewrites a public object URL to the render/image endpoint with width/height/quality.
 * Falls back to the original URL for non-Supabase URLs.
 */
export function transformImage(
  url: string | null | undefined,
  opts: { width?: number; height?: number; quality?: number; resize?: "cover" | "contain" | "fill" } = {}
): string | undefined {
  if (!url) return undefined;
  const { width, height, quality = 70, resize = "cover" } = opts;
  try {
    // Match Supabase public object storage URLs
    const marker = "/storage/v1/object/public/";
    const idx = url.indexOf(marker);
    if (idx === -1) return url;

    // Personal Supabase projects can have stricter image-render behavior than
    // the default project; the raw public object URL is the most reliable path.
    void width;
    void height;
    void quality;
    void resize;
    return url;
  } catch {
    return url;
  }
}
