import QRCode from "qrcode";

// Client-side QR generation. Dark modules on white with a 4-module quiet zone
// and high error correction, whatever the app theme, so phones can scan it.
export const QR_QUIET_ZONE = 4;

export function qrMatrix(url: string): { size: number; dark: (x: number, y: number) => boolean } {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  return { size, dark: (x, y) => data[y * size + x] === 1 };
}

export function qrSvg(url: string): string {
  const { size, dark } = qrMatrix(url);
  const total = size + QR_QUIET_ZONE * 2;
  let path = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark(x, y)) path += `M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total * 10}" height="${total * 10}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#ffffff"/><path d="${path}" fill="#000000"/></svg>`;
}

/** RGBA pixels for the code at `scale` pixels per module, including quiet zone. */
export function qrPixels(url: string, scale: number): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const { size, dark } = qrMatrix(url);
  const px = (size + QR_QUIET_ZONE * 2) * scale;
  const data = new Uint8ClampedArray(new ArrayBuffer(px * px * 4)).fill(255);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - QR_QUIET_ZONE;
      const my = Math.floor(y / scale) - QR_QUIET_ZONE;
      if (mx >= 0 && my >= 0 && mx < size && my < size && dark(mx, my)) {
        const i = (y * px + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  }
  return { width: px, height: px, data };
}

/** PNG blob of about 2000px, enough for print and projection. */
export function qrPng(url: string): Promise<Blob> {
  const { size } = qrMatrix(url);
  const scale = Math.max(1, Math.ceil(2000 / (size + QR_QUIET_ZONE * 2)));
  const img = qrPixels(url, scale);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas is not available"));
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"));
}
