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
