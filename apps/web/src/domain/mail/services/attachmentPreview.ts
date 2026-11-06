/**
 * Quelles pièces jointes s'affichent dans la page. Dupliqué à l'identique côté API
 * (`apps/api/src/domain/mail/services/attachmentPreview.ts`) : l'écran ne propose
 * « Aperçu » que pour ce que l'API acceptera de servir en `inline`.
 *
 * **Liste fermée de types qui ne portent aucun script.** Un SVG ou un HTML envoyé par un
 * inconnu, servi « inline » depuis notre origine, exécuterait son script chez nous : ils
 * restent des téléchargements.
 *
 * Le type déclaré par l'expéditeur fait foi, sauf `application/octet-stream` (ou vide),
 * fréquent pour un PDF envoyé par un logiciel de facturation : l'extension tranche alors.
 */

export type AttachmentPreviewKind = 'image' | 'pdf' | 'text';

const BY_TYPE: Record<string, AttachmentPreviewKind> = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/bmp': 'image',
  'application/pdf': 'pdf',
  'text/plain': 'text',
};

const BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** Le type à servir en aperçu, ou `null` si la pièce ne s'affiche pas dans la page. */
export const previewContentType = (contentType: string, filename: string): string | null => {
  const declared = contentType.split(';')[0]!.trim().toLowerCase();
  if (BY_TYPE[declared]) return declared;
  if (!GENERIC.has(declared)) return null;
  const extension = filename.split('.').at(-1)?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? null;
};

export const previewKind = (
  contentType: string,
  filename: string,
): AttachmentPreviewKind | null => {
  const type = previewContentType(contentType, filename);
  return type ? BY_TYPE[type]! : null;
};
