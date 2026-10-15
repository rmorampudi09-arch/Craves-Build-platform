/**
 * Dish, kitchen and plan photos are shown to customers straight from storage, at the size they were uploaded.
 * A phone photo can be 4000 px and several MB, so every card would download all of it. Before
 * upload, shrink it to 1600 px on the long side (sharp on a 2x phone screen at full width) as a
 * JPEG. Anything that can't be shrunk, or wouldn't get smaller, is uploaded as chosen.
 * `aspect` (width / height) first keeps the centre in that shape, like the app's 4:3 kitchen and plan photos.
 */
const LONG_EDGE = 1600;
const QUALITY = 0.85;
const ALREADY_SMALL_BYTES = 500 * 1024;

/** The centre of a width × height photo in the `aspect` shape (source box), and the size it is drawn at. */
export function photoCrop(width: number, height: number, aspect?: number) {
  const sw = aspect ? Math.min(width, Math.round(height * aspect)) : width;
  const sh = aspect ? Math.min(height, Math.round(width / aspect)) : height;
  const scale = Math.min(1, LONG_EDGE / Math.max(sw, sh));
  return {
    sx: Math.round((width - sw) / 2),
    sy: Math.round((height - sh) / 2),
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}

export async function shrinkPhoto(file: File, aspect?: number): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const box = photoCrop(bitmap.width, bitmap.height, aspect);
    const cropped = box.sw < bitmap.width || box.sh < bitmap.height;
    if (Math.max(box.sw, box.sh) <= LONG_EDGE && !cropped && file.size <= ALREADY_SMALL_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: a see-through PNG gets a white plate, like a menu card.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || (!cropped && blob.size >= file.size)) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
