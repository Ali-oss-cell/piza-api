/** Melbourne calendar-day bounds in absolute UTC Date objects. */
export function melbourneDayBounds(reference = new Date()): {
  from: Date;
  to: Date;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const day = formatter.format(reference); // YYYY-MM-DD
  return {
    from: melbourneLocalToUtc(`${day}T00:00:00`),
    to: melbourneLocalToUtc(`${day}T23:59:59.999`),
  };
}

export function resolvePeriod(from?: string, to?: string): { from: Date; to: Date } {
  if (from && to) {
    return { from: new Date(from), to: new Date(to) };
  }
  return melbourneDayBounds();
}

function melbourneLocalToUtc(localIso: string): Date {
  // Treat local Melbourne wall time as if labeled UTC then subtract offset.
  const asUtc = new Date(`${localIso}+00:00`);
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(asUtc)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  const displayed = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = displayed - asUtc.getTime();
  return new Date(asUtc.getTime() - offset);
}

export function money(value: unknown): number {
  return Number(value ?? 0);
}
