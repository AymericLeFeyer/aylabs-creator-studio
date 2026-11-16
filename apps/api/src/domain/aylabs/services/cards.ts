import type { ProductCard, VideoCard } from '../entities/AylabsCard.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Format des frontmatters du site : `Nov 29 2025`. */
export const toPubDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${String(d).padStart(2, '0')} ${y}`;
};

/** Reproduit les slugs existants du site : minuscules, accents retirés, tirets. */
export const slugify = (input: string): string =>
  input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 90)
    .replace(/-+$/g, '');

export const uniqueSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/** Date et heure de mise en ligne en heure de Paris, comme le site les interprète. */
export const parisDateTime = (iso: string): { date: string; time: string } => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(parsed)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
};

/** `PT1H2M5S` → `1:02:05`, `PT19M29S` → `19:29`. Vide si illisible. */
export const formatIsoDuration = (iso: string | null | undefined): string => {
  const match = iso?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return '';
  const [hours, minutes, seconds] = [match[1], match[2], match[3]].map((part) => Number(part ?? 0));
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
};

const SECTION_HEADER = /^▶\s*(.+)$/;

/**
 * L'accroche d'une description YouTube, sur une ligne : les fiches n'en gardent que ça.
 * Quand la description a une section `▶ VIDÉO` (le haut est alors réservé au sponsor), on
 * part de là. Hashtags, liens et en-têtes de section sont écartés.
 */
export const summarizeDescription = (raw: string): string => {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const videoSection = lines.findIndex((line) =>
    /^vid[ée]o$/i.test(SECTION_HEADER.exec(line.trim())?.[1]?.trim() ?? ''),
  );
  const paragraphs = lines
    .slice(videoSection + 1)
    .join('\n')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter(
          (line) =>
            line &&
            !line.startsWith('#') &&
            !SECTION_HEADER.test(line) &&
            !/https?:\/\//.test(line),
        )
        .join(' ')
        .trim(),
    )
    .filter(Boolean);
  return paragraphs[0] ?? '';
};

// --- Sérialisation : le sous-ensemble YAML que comprend le parseur du site ------------

type Value = string | number | null | string[] | Record<string, unknown>;

/** Une valeur scalaire ne contient jamais de saut de ligne : le parseur du site est ligne à ligne. */
const oneLine = (value: string): string => value.replace(/\s*\n\s*/g, ' ').trim();

const scalar = (value: unknown): string =>
  value === null || typeof value === 'number' ? String(value) : `"${oneLine(String(value))}"`;

const frontmatter = (entries: [string, Value | undefined][]): string => {
  const lines: string[] = [];
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (Array.isArray(value)) {
      const items = value.map((item) => oneLine(String(item))).filter(Boolean);
      if (items.length === 0) continue;
      lines.push(`${key}:`, ...items.map((item) => `  - "${item}"`));
      continue;
    }
    if (value !== null && typeof value === 'object') continue;
    lines.push(`${key}: ${scalar(value)}`);
  }
  return lines.join('\n');
};

const markdown = (entries: [string, Value | undefined][], body: string): string => {
  const trimmed = body.trim();
  const head = frontmatter(entries);
  return trimmed ? `---\n${head}\n---\n\n${trimmed}\n` : `---\n${head}\n---\n`;
};

export const videoMarkdown = (card: VideoCard): string =>
  markdown(
    [
      ['title', card.title],
      ['description', card.description],
      ['pubDate', toPubDate(card.pubDate)],
      ['pubTime', card.pubTime || undefined],
      ['code', card.code],
      ['duration', card.duration],
      ['tags', card.tags],
    ],
    card.body,
  );

export const productMarkdown = (card: ProductCard): string =>
  markdown(
    [
      ['title', card.title],
      ['image', card.image],
      ['description', card.description],
      ['tags', card.tags],
      ['protocols', card.protocols],
      ['compatible', card.compatible],
      ['videoCode', card.videoCode],
      ['buyLinks', card.buyLinks],
      ['pubDate', toPubDate(card.pubDate)],
      ['category', card.category],
      ['price', card.price ?? 0],
      ['rating', card.rating ?? undefined],
      ['pros', card.pros],
      ['cons', card.cons],
      ['verdict', card.verdict],
    ],
    card.body,
  );
