const MAX_SIDE = 1536;

const load = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`« ${file.name} » n’est pas une image lisible.`));
    };
    image.src = url;
  });

/**
 * Réduit une image avant l'envoi : une photo de téléphone pèse dix fois ce qu'OpenAI en
 * utilise. WebP garde la transparence d'un détourage ; Safari, qui ne sait pas en écrire,
 * retombe tout seul sur du PNG, et l'API lit le vrai type dans les octets.
 */
export const prepareImage = async (file: File): Promise<string> => {
  const image = await load(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Ce navigateur ne sait pas préparer l’image.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.9);
};
