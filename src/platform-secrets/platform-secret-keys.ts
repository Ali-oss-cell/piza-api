/** Keys platform admins may set via HQ. Expand only with explicit product approval. */
export const PLATFORM_SECRET_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'LINKLY_ENV',
] as const;

export type PlatformSecretKey = (typeof PLATFORM_SECRET_KEYS)[number];

export function isPlatformSecretKey(key: string): key is PlatformSecretKey {
  return (PLATFORM_SECRET_KEYS as readonly string[]).includes(key);
}
