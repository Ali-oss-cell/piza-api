const MELBOURNE_TZ = 'Australia/Melbourne';

function getZonedParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: MELBOURNE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour === '24' ? '0' : lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

/**
 * Convert a wall-clock time in Melbourne (yyyy-MM-dd HH:mm:ss) into a UTC Date
 * by iteratively resolving the timezone offset for the given moment (handles DST).
 */
function melbourneWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  let guess = new Date(targetUtcMs);
  for (let i = 0; i < 3; i += 1) {
    const parts = getZonedParts(guess);
    const partsUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const offsetMs = partsUtcMs - guess.getTime();
    const nextGuess = new Date(targetUtcMs - offsetMs);
    if (nextGuess.getTime() === guess.getTime()) {
      return nextGuess;
    }
    guess = nextGuess;
  }

  return guess;
}

/**
 * Returns start (00:00:00) and end (23:59:59.999) of the Melbourne day that
 * contains the given date. Both dates are UTC instants.
 */
export function melbourneDayBounds(date: Date = new Date()): {
  from: Date;
  to: Date;
} {
  const parts = getZonedParts(date);
  const from = melbourneWallClockToUtc(
    parts.year,
    parts.month,
    parts.day,
    0,
    0,
    0,
  );
  const endOfDay = melbourneWallClockToUtc(
    parts.year,
    parts.month,
    parts.day,
    23,
    59,
    59,
  );
  const to = new Date(endOfDay.getTime() + 999);

  return { from, to };
}

/**
 * Parses a date-only string (yyyy-MM-dd) as the Melbourne start-of-day.
 * Returns undefined if the input is not a valid date.
 */
export function parseMelbourneDay(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const [, year, month, day] = match;
  return melbourneWallClockToUtc(
    Number(year),
    Number(month),
    Number(day),
    0,
    0,
    0,
  );
}

/**
 * Parses a date-only string (yyyy-MM-dd) as the Melbourne end-of-day.
 */
export function parseMelbourneDayEnd(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  const [, year, month, day] = match;
  const endOfDay = melbourneWallClockToUtc(
    Number(year),
    Number(month),
    Number(day),
    23,
    59,
    59,
  );
  return new Date(endOfDay.getTime() + 999);
}

/**
 * Returns the yyyy-MM-dd bucket key for a given date in Melbourne time.
 */
export function melbourneDayKey(date: Date): string {
  const parts = getZonedParts(date);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export { MELBOURNE_TZ };
