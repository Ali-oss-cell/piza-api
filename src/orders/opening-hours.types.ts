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

/** Accept HH:MM or H:MM (optional seconds) and return HH:MM, or null if invalid. */
export function normalizeTimeString(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function closeMinutesForValidation(open: string, close: string): number {
  const openMinutes = parseTimeToMinutes(open);
  const closeMinutes = parseTimeToMinutes(close);
  // 00:00 close means end of day (midnight), e.g. open 17:00 → close midnight.
  if (closeMinutes === 0 && openMinutes > 0) {
    return 24 * 60;
  }
  return closeMinutes;
}

export const DEFAULT_OPENING_HOURS: OpeningHoursConfig = {
  timezone: 'Australia/Melbourne',
  leadTimeMinutes: 45,
  slotIntervalMinutes: 15,
  days: {
    monday: { open: '17:00', close: '23:00' },
    tuesday: { open: '17:00', close: '23:00' },
    wednesday: { open: '17:00', close: '23:00' },
    thursday: { open: '17:00', close: '23:00' },
    friday: { open: '17:00', close: '23:00' },
    saturday: { open: '12:00', close: '23:59' },
    sunday: { open: '12:00', close: '23:59' },
  },
};

function isValidDayHours(value: unknown): value is DayHours {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const day = value as Partial<DayHours>;
  if (typeof day.open !== 'string' || typeof day.close !== 'string') {
    return false;
  }
  return normalizeTimeString(day.open) !== null && normalizeTimeString(day.close) !== null;
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

/** Normalize admin payload into a safe OpeningHoursConfig, or null if invalid. */
export function normalizeOpeningHours(
  value: unknown,
): OpeningHoursConfig | null {
  if (value === null) {
    return null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<OpeningHoursConfig>;
  const timezone =
    typeof raw.timezone === 'string' && raw.timezone.trim()
      ? raw.timezone.trim()
      : DEFAULT_OPENING_HOURS.timezone;
  const leadTimeMinutes =
    typeof raw.leadTimeMinutes === 'number' && raw.leadTimeMinutes >= 0
      ? Math.round(raw.leadTimeMinutes)
      : DEFAULT_OPENING_HOURS.leadTimeMinutes;
  const slotIntervalMinutes =
    typeof raw.slotIntervalMinutes === 'number' && raw.slotIntervalMinutes >= 1
      ? Math.round(raw.slotIntervalMinutes)
      : DEFAULT_OPENING_HOURS.slotIntervalMinutes;

  if (!raw.days || typeof raw.days !== 'object') {
    return null;
  }

  const days = {} as Record<WeekdayKey, DayHours | null>;
  for (const key of WEEKDAY_KEYS) {
    const dayValue = (raw.days as Record<string, unknown>)[key];
    if (dayValue === null || dayValue === undefined) {
      days[key] = null;
      continue;
    }
    if (!isValidDayHours(dayValue)) {
      return null;
    }
    const open = normalizeTimeString(dayValue.open)!;
    const close = normalizeTimeString(dayValue.close)!;
    const openMinutes = parseTimeToMinutes(open);
    const closeMinutes = closeMinutesForValidation(open, close);
    if (closeMinutes <= openMinutes) {
      return null;
    }
    days[key] = { open, close };
  }

  return {
    timezone,
    leadTimeMinutes,
    slotIntervalMinutes,
    days,
  };
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
  const closeMinutes = closeMinutesForValidation(dayHours.open, dayHours.close);

  return minutes >= openMinutes && minutes <= closeMinutes;
}
