import { supabase } from "@/integrations/supabase/client";

const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const OUTPUT_DIM = 512;

export type AvatarFileResult = {
  file: File;
  dataUrl: string;
};

export function validateAvatarFile(file: File): string | null {
  if (!ACCEPTED.includes(file.type)) return "Only JPG, PNG, or WEBP images are allowed";
  if (file.size > MAX_SIZE_BYTES) return "Image must be 2MB or smaller";
  return null;
}

/** Center-crop to square and resize to 512x512 JPEG. */
export async function processAvatar(file: File): Promise<AvatarFileResult> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_DIM;
  canvas.height = OUTPUT_DIM;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, OUTPUT_DIM, OUTPUT_DIM);
  bitmap.close?.();

  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Failed to process image"))), "image/jpeg", 0.88)
  );
  const processed = new File([blob], "avatar.jpg", { type: "image/jpeg" });
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(processed);
  });
  return { file: processed, dataUrl };
}

/** Upload to avatars/{userId}/{ts}-{rand}.jpg, returns public URL. */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
const { error } = await supabase.storage.from("avatars").upload(path, file, {
  cacheControl: "3600",
  upsert: true,  // ✅ পরিবর্তন করুন
  contentType: file.type,
});
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
