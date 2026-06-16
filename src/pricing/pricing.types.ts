export interface QuoteLineResult {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  size?: string;
  crust?: string;
  toppingIds: string[];
  removedIngredients: string[];
}

export interface QuoteResult {
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  lines: QuoteLineResult[];
}
