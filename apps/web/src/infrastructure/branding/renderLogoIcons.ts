import type { BrandingIconKey } from '../../domain/branding/entities/Branding.ts';

/**
 * Chaque emplacement : sa taille, son fond, et la part du canevas occupée par le logo.
 *
 * - **iOS ignore la transparence** et compose l'icône d'écran d'accueil sur du noir :
 *   `apple-180` a donc un fond blanc opaque.
 * - **Une icône `maskable` est rognée** par Android selon la forme du lanceur : le logo
 *   n'y occupe que 60 %, ce qui le garde dans la zone de sécurité quelle que soit la
 *   découpe. Mêmes règles que le jeu d'icônes d'origine (voir la section PWA du
 *   `CLAUDE.md`).
 */
const SPECS: Record<BrandingIconKey, { size: number; background: string | null; scale: number }> = {
  'favicon-32': { size: 32, background: null, scale: 1 },
  'icon-192': { size: 192, background: null, scale: 1 },
  'icon-512': { size: 512, background: null, scale: 1 },
  'maskable-512': { size: 512, background: '#ffffff', scale: 0.6 },
  'apple-180': { size: 180, background: '#ffffff', scale: 0.8 },
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible. Essaie un PNG, un JPEG, un WebP ou un SVG.'));
    };
    image.src = url;
  });

/**
 * Produit les cinq PNG du logo **dans le navigateur**, par un canevas : l'API n'a ainsi
 * aucune bibliothèque d'image à embarquer (contrainte du projet : rien à compiler), et
 * elle se contente de ranger ce qu'on lui envoie. Le logo est **contenu**, jamais rogné :
 * un logo en longueur garde ses proportions et se centre dans le carré.
 */
export const renderLogoIcons = async (file: File): Promise<Record<BrandingIconKey, string>> => {
  const image = await loadImage(file);
  // Un SVG sans dimensions intrinsèques rend 0 × 0 : on le traite comme un carré.
  const width = image.naturalWidth || 512;
  const height = image.naturalHeight || 512;

  const entries = Object.entries(SPECS).map(([key, spec]) => {
    const canvas = document.createElement('canvas');
    canvas.width = spec.size;
    canvas.height = spec.size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canevas indisponible dans ce navigateur.');
    if (spec.background) {
      context.fillStyle = spec.background;
      context.fillRect(0, 0, spec.size, spec.size);
    }
    const box = spec.size * spec.scale;
    const ratio = Math.min(box / width, box / height);
    const drawWidth = width * ratio;
    const drawHeight = height * ratio;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      (spec.size - drawWidth) / 2,
      (spec.size - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );
    return [key, canvas.toDataURL('image/png')] as const;
  });

  return Object.fromEntries(entries) as Record<BrandingIconKey, string>;
};
