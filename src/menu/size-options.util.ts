export interface SizeOptionValue {
  enabled: boolean;
  price: number;
}

export interface SizeOptions {
  small: SizeOptionValue;
  large: SizeOptionValue;
  family: SizeOptionValue;
}

export function createDefaultSizeOptions(
  small = 20,
  large = 24,
  family = 28,
): SizeOptions {
  return {
    small: { enabled: true, price: small },
    large: { enabled: true, price: large },
    family: { enabled: true, price: family },
  };
}

export function deriveBasePrice(sizeOptions: SizeOptions): number {
  const enabledPrices = [
    sizeOptions.small,
    sizeOptions.large,
    sizeOptions.family,
  ]
    .filter((option) => option?.enabled)
    .map((option) => option.price);

  if (enabledPrices.length > 0) {
    return enabledPrices[0];
  }

  return (
    sizeOptions.large?.price ??
    sizeOptions.small?.price ??
    sizeOptions.family?.price ??
    0
  );
}

export function toLegacySizePricing(
  sizeOptions: SizeOptions,
): Record<'small' | 'large' | 'family', number> {
  return {
    small: sizeOptions.small?.price ?? 0,
    large: sizeOptions.large?.price ?? 0,
    family: sizeOptions.family?.price ?? 0,
  };
}

export function parseIngredients(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatIngredients(ingredients: string[]): string {
  return ingredients.join(', ');
}
