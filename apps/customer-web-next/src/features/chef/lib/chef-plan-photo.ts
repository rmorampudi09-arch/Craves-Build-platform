/**
 * Plan photos are shown 4:3 on plan cards. Like the app's picker, the middle 4:3 is kept and the photo is sent as a
 * JPEG of at most 1600 px wide, well inside the server's 2 MB and 4096 px. A photo the browser can't read is sent as
 * chosen and the server checks it.
 */
export const PLAN_PHOTO_TYPES = ["image/jpeg", "image/png"];
export const PLAN_PHOTO_MAX_BYTES = 2_097_152;
const LONG_EDGE = 1600;
const QUALITY = 0.85;

/** The middle 4:3 of a width × height photo (source box) and the size it is drawn at. */
export function planPhotoCrop(width: number, height: number) {
  const sw = Math.min(width, Math.round((height * 4) / 3));
  const sh = Math.min(height, Math.round((width * 3) / 4));
  const scale = Math.min(1, LONG_EDGE / sw);
  return {
    sx: Math.round((width - sw) / 2),
    sy: Math.round((height - sh) / 2),
    sw,
    sh,
    width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)),
  };
}

export async function preparePlanPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const box = planPhotoCrop(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = box.width;
    canvas.height = box.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // JPEG has no transparency: a see-through PNG gets a white plate.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, box.width, box.height);
    context.drawImage(bitmap, box.sx, box.sy, box.sw, box.sh, 0, 0, box.width, box.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    return blob
      ? new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "plan"}.jpg`, {
          type: "image/jpeg",
        })
      : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
