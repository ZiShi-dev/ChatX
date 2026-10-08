async function crop(file: File, width: number, height: number) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('image_too_large');
  let bitmap: ImageBitmap | HTMLImageElement;
  let url: string | undefined;
  if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file);
  else {
    url = URL.createObjectURL(file);
    try {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('invalid_image'));
        image.src = url!;
      });
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  }
  try {
  const sw = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const sh = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (!sw || !sh || sw * sh > 24_000_000) throw new Error('image_too_large');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas_unavailable');
  }
  const scale = Math.max(width / sw, height / sh);
  const drawnWidth = sw * scale;
  const drawnHeight = sh * scale;
  context.drawImage(bitmap, (width - drawnWidth) / 2, (height - drawnHeight) / 2, drawnWidth, drawnHeight);
  for (const quality of [0.78, 0.65, 0.5, 0.35]) {
    const result = canvas.toDataURL('image/jpeg', quality);
    if (result.length <= (width === 256 ? 80_000 : 180_000)) return result;
  }
  throw new Error('image_too_large');
  } finally {
    if ('close' in bitmap) bitmap.close();
    if (url) URL.revokeObjectURL(url);
  }
}

export function readPhoto(file: File) { return crop(file, 256, 256); }
export function readBanner(file: File) { return crop(file, 960, 420); }
