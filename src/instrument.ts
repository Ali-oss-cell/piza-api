import * as Sentry from '@sentry/nestjs';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT?.trim() ||
      process.env.NODE_ENV ||
      'development',
    // Keep performance light for a single Droplet.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    beforeSend(event, hint) {
      const error = hint.originalException;
      if (
        error &&
        typeof error === 'object' &&
        'status' in error &&
        typeof (error as { status?: unknown }).status === 'number'
      ) {
        const status = (error as { status: number }).status;
        // Skip expected client/validation failures.
        if (status >= 400 && status < 500) {
          return null;
        }
      }
      return event;
    },
  });
}
