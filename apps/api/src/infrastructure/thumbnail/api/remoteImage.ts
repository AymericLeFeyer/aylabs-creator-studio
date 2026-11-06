import { badRequest, upstream } from '../../../shared/errors.ts';

const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; CreatorStudio/1.0)',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,text/html;q=0.5',
};

export interface RemoteImage {
  /** `data:<type>;base64,…`, prêt pour un `<img>` puis pour `prepareImage`. */
  image: string;
  /** Un nom lisible, tiré de l'adresse. */
  name: string;
}

const parseUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw badRequest('Adresse invalide.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest('Seules les adresses http et https sont acceptées.');
  }
  return url;
};

const get = async (url: URL): Promise<Response> => {
  try {
    const response = await fetch(url, {
      headers: HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw upstream(`Le site a répondu ${response.status}.`);
    return response;
  } catch (failure) {
    if (failure instanceof Error && failure.name === 'AppError') throw failure;
    throw upstream('Impossible de joindre cette adresse.');
  }
};

const readCapped = async (response: Response): Promise<Uint8Array> => {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw badRequest('Image trop lourde (20 Mo au plus).');
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) throw badRequest('Image trop lourde (20 Mo au plus).');
  return buffer;
};

/** L'image annoncée par une page (`og:image`, sinon `twitter:image`). */
const pageImage = (html: string, base: URL): URL | null => {
  for (const key of ['og:image:secure_url', 'og:image', 'twitter:image']) {
    const pattern = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      'i',
    );
    const match = pattern.exec(html);
    const found = match?.[1] ?? match?.[2];
    if (found) {
      try {
        return new URL(found.replaceAll('&amp;', '&'), base);
      } catch {
        return null;
      }
    }
  }
  return null;
};

const imageType = (response: Response): string | null => {
  const type =
    (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  // Le SVG est écarté : il ne se redimensionne pas proprement sur un canevas.
  return type.startsWith('image/') && type !== 'image/svg+xml' ? type : null;
};

/**
 * Télécharge une image depuis son adresse, **côté serveur** : la plupart des sites refusent
 * qu'une autre page lise leurs images (CORS), et le navigateur ne pourrait pas la redimensionner.
 * Une adresse de **page** (fiche produit, article) est acceptée : on y prend son `og:image`.
 * Rien n'est stocké ; le navigateur la prépare comme un fichier importé.
 */
export const fetchRemoteImage = async (value: string): Promise<RemoteImage> => {
  let url = parseUrl(value);
  let response = await get(url);

  if (!imageType(response)) {
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw badRequest('Cette adresse ne renvoie pas une image.');
    const html = new TextDecoder().decode(await readCapped(response));
    const found = pageImage(html, url);
    if (!found) throw badRequest('Cette page n’annonce aucune image.');
    url = parseUrl(found.toString());
    response = await get(url);
  }

  const mimeType = imageType(response);
  if (!mimeType) throw badRequest('Cette adresse ne renvoie pas une image.');
  const data = await readCapped(response);
  const last = url.pathname.split('/').pop() || url.hostname;
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // Un nom mal encodé reste tel quel.
  }
  return { image: `data:${mimeType};base64,${Buffer.from(data).toString('base64')}`, name };
};
