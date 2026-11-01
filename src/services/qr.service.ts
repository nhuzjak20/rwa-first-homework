import QRCode from 'qrcode';

/** Generates a PNG QR code on demand; images are never persisted. */
export function generateQrPng(content: string): Promise<Buffer> {
  return QRCode.toBuffer(content, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 320 });
}

export function publicInfoUrl(baseUrl: string, passId: string): string {
  return `${baseUrl}/info/${encodeURIComponent(passId)}`;
}

export function apiPassUrl(baseUrl: string, passId: string): string {
  return `${baseUrl}/passes/${encodeURIComponent(passId)}`;
}
