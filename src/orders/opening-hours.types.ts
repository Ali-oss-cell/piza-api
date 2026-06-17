export interface DayHours {
  open: string;
  close: string;
}

export type WeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface OpeningHoursConfig {
  timezone: string;
  leadTimeMinutes: number;
  slotIntervalMinutes: number;
  days: Record<WeekdayKey, DayHours | null>;
}

export const WEEKDAY_KEYS: WeekdayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

export function weekdayKeyFromDate(date: Date, timezone: string): WeekdayKey {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
  })
    .format(date)
    .toLowerCase() as WeekdayKey;

  return weekday;
}

export function parseOpeningHours(
  value: unknown,
): OpeningHoursConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const config = value as Partial<OpeningHoursConfig>;

  if (
    typeof config.timezone !== 'string' ||
    typeof config.leadTimeMinutes !== 'number' ||
    typeof config.slotIntervalMinutes !== 'number' ||
    !config.days ||
    typeof config.days !== 'object'
  ) {
    return null;
  }

  return config as OpeningHoursConfig;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function getZonedParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
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
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
  };
}

export function minutesInTimezone(date: Date, timezone: string): number {
  const parts = getZonedParts(date, timezone);
  return parts.hour * 60 + parts.minute;
}

export function isWithinOpeningHours(
  scheduledAt: Date,
  config: OpeningHoursConfig,
): boolean {
  const weekday = weekdayKeyFromDate(scheduledAt, config.timezone);
  const dayHours = config.days[weekday];

  if (!dayHours) {
    return false;
  }

  const minutes = minutesInTimezone(scheduledAt, config.timezone);
  const openMinutes = parseTimeToMinutes(dayHours.open);
  const closeMinutes = parseTimeToMinutes(dayHours.close);

  return minutes >= openMinutes && minutes <= closeMinutes;
}
