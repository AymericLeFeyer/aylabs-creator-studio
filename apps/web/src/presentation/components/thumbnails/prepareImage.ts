const MAX_SIDE = 1536;

const load = (src: string, name: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`« ${name} » n’est pas une image lisible.`));
    image.src = src;
  });

const loadFile = async (file: File): Promise<HTMLImageElement> => {
  const url = URL.createObjectURL(file);
  try {
    return await load(url, file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * Réduit une image avant l'envoi : une photo de téléphone pèse dix fois ce qu'OpenAI en
 * utilise. WebP garde la transparence d'un détourage ; Safari, qui ne sait pas en écrire,
 * retombe tout seul sur du PNG, et l'API lit le vrai type dans les octets.
 */
const shrink = (image: HTMLImageElement): string => {
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Ce navigateur ne sait pas préparer l’image.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
};

export const prepareImage = async (file: File): Promise<string> => shrink(await loadFile(file));

/** Même préparation pour une image téléchargée par l'API (`data:` URL). */
export const prepareDataUrl = async (dataUrl: string, name: string): Promise<string> =>
  shrink(await load(dataUrl, name));
