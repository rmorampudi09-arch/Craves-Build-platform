/**
 * Dish photos are shown to customers straight from storage, at the size they were uploaded.
 * A phone photo can be 4000 px and several MB, so every card would download all of it. Before
 * upload, shrink it to 1600 px on the long side (sharp on a 2x phone screen at full width) as a
 * JPEG. Anything that can't be shrunk, or wouldn't get smaller, is uploaded as chosen.
 */
const LONG_EDGE = 1600;
const QUALITY = 0.85;
const ALREADY_SMALL_BYTES = 500 * 1024;

export async function shrinkDishPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= ALREADY_SMALL_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: a see-through PNG gets a white plate, like a menu card.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "dish"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
