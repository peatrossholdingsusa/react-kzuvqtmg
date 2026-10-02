// Prepares a contact photo for a vCard: center-crops to a square and shrinks it
// so the .vcf stays small enough to send by text message.
export const PHOTO_SIZE = 400;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });

export const preparePhoto = async (file, size = PHOTO_SIZE, quality = 0.85) => {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, HEIC or similar).');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('That image is over 15 MB. Please choose a smaller photo.');
  }
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const out = Math.min(size, side);

  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  // JPEG has no transparency; fill white so transparent PNGs don't turn black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
  return canvas.toDataURL('image/jpeg', quality);
};
