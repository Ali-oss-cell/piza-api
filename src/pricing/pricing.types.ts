export interface QuoteLineResult {
  type: 'ITEM' | 'COMBO';
  menuItemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  size?: string;
  crust?: string;
  toppingIds: string[];
  removedIngredients: string[];
  comboDealId?: string;
  comboInstanceId?: string;
  isComboHeader?: boolean;
}

export interface QuoteResult {
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  lines: QuoteLineResult[];
}
