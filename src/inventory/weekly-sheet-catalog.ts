import type { StockUnit } from '@prisma/client';

/**
 * Benny Boy's "Weekly Stock Order Sheet" catalogue (11 categories, 65 items).
 * `guide` is the suggested weekly order at ~500 pizzas; null = the form has no
 * guide ("-") and must stay null (never 0).
 */
export const WEEKLY_SHEET_GUIDE_BASE_PIZZAS = 500;

export type WeeklySheetCatalogItem = {
  name: string;
  unit: StockUnit;
  packSize: string | null;
  guide: number | null;
};

export type WeeklySheetCatalogCategory = {
  name: string;
  note?: string;
  items: WeeklySheetCatalogItem[];
};

const i = (
  name: string,
  unit: StockUnit,
  packSize: string | null,
  guide: number | null,
): WeeklySheetCatalogItem => ({ name, unit, packSize, guide });

export const WEEKLY_SHEET_CATALOG: WeeklySheetCatalogCategory[] = [
  {
    name: 'Dough & bases',
    items: [
      i('Pizza dough ball (Maximus flour, made in-house)', 'KG', null, 201.3),
    ],
  },
  {
    name: 'Sauces',
    items: [
      i('Napoli / crushed tomatoes', 'KG', '10 kg tub', 53.9),
      i('Satay base sauce', 'KG', '5 kg tub', 1.7),
      i('BBQ sauce', 'KG', '5 kg tub', 2.9),
      i('Pesto', 'KG', '2 kg tub', 0.7),
      i('Tandoori sauce', 'KG', '2 kg tub', 0.6),
    ],
  },
  {
    name: 'Cheese',
    items: [
      i('Shredded mozzarella - standard/double', 'KG', '20 kg carton', 97.9),
      i('Feta cheese', 'KG', '2 kg tub', 0.9),
    ],
  },
  {
    name: 'Meat & seafood',
    items: [
      i('Shredded ham', 'KG', null, 15.4),
      i('Pepperoni / hot salami (Lago)', 'KG', null, 12.1),
      i('Roasted chicken breast', 'KG', null, 12.1),
      i('Seasoned beef mince', 'KG', null, 3.3),
      i('Smoky bacon', 'KG', null, 4.4),
      i('Spiced chorizo', 'KG', null, 2.2),
      i('Prawns', 'KG', null, 2.2),
      i('Smoked mussels', 'KG', null, 0.6),
      i('Anchovies', 'KG', null, 0.4),
      i('Fresh eggs', 'EACH', 'tray of 30', 29),
    ],
  },
  {
    name: 'Vegetables & produce',
    items: [
      i('Sliced mushrooms', 'KG', null, 5.5),
      i('Spanish / red onion', 'KG', null, 5.5),
      i('Roasted capsicum', 'KG', null, 6.6),
      i('Pineapple pieces', 'KG', null, 7.7),
      i('Kalamata olives', 'KG', null, 4.4),
      i('Jalapenos', 'KG', null, 1.1),
      i('Baby spinach', 'KG', null, 0.6),
      i('Fresh sliced tomato', 'KG', null, 1.7),
      i('Sun-dried tomatoes', 'KG', null, 0.6),
      i('Garlic (minced)', 'KG', '1 kg tub', 0.6),
    ],
  },
  {
    name: 'Oils, herbs & finishes',
    items: [
      i('Garlic / chilli / olive oil', 'L', null, 1.1),
      i('Dried oregano / rosemary', 'KG', null, 0.2),
      i('Chilli flakes / parsley / basil', 'KG', null, 0.2),
    ],
  },
  {
    name: 'Packaging - pizza boxes',
    items: [
      i('9 inch pizza box (Small)', 'EACH', 'sleeve of 50', 152),
      i('12 inch pizza box (Large)', 'EACH', 'sleeve of 50', 333),
      i('15 inch pizza box (Family)', 'EACH', 'sleeve of 25', 121),
    ],
  },
  {
    name: 'Pastas, parmas & sides',
    note: 'not in cost model - check stock by eye',
    items: [
      i('Pasta (dry, 140g portions)', 'KG', null, null),
      i('Crumbed chicken schnitzel (parma)', 'KG', null, null),
      i('Hyfun fries 300g portions', 'KG', null, null),
      i('Farm Frites potato wedges', 'KG', null, null),
      i('Sour cream', 'KG', null, null),
      i('Chicken salt', 'KG', null, null),
      i('Delicup garlic bread rolls', 'EACH', null, null),
      i('Snack boxes (fries/wedges)', 'EACH', null, null),
      i('Foil wrap (garlic bread)', 'ROLL', null, null),
    ],
  },
  {
    name: 'Desserts',
    items: [
      i('Small pizza dough (chocolate pizza base)', 'KG', null, null),
      i('Nutella (or equivalent)', 'KG', null, null),
      i('Maymax jam donuts', 'EACH', null, null),
      i('Gelato tubs (assorted flavours)', 'EACH', null, null),
      i('Cake slices', 'EACH', null, null),
    ],
  },
  {
    name: 'Drinks',
    items: [
      i('Pepsi 375ml can', 'EACH', 'carton of 24', null),
      i('Pepsi Max 375ml can', 'EACH', 'carton of 24', null),
      i('Lemonade 375ml can', 'EACH', 'carton of 24', null),
      i('Solo 375ml can', 'EACH', 'carton of 24', null),
      i('Sunkist 375ml can', 'EACH', 'carton of 24', null),
      i('Mountain Dew 375ml can', 'EACH', 'carton of 24', null),
      i('Pepsi 1.25L bottle', 'EACH', null, null),
      i('Pepsi Max 1.25L bottle', 'EACH', null, null),
      i('Lemonade 1.25L bottle', 'EACH', null, null),
      i('Solo 1.25L bottle', 'EACH', null, null),
    ],
  },
  {
    name: 'Consumables & cleaning',
    note: 'fill in from your own stock check',
    items: [
      i('Napkins', 'PACK', null, null),
      i('Sauce sachets (tomato, BBQ, sweet chilli)', 'PACK', null, null),
      i('Paper bags (donuts)', 'PACK', null, null),
      i('Gloves', 'BOX', null, null),
      i('Garbage bags', 'ROLL', null, null),
      i('EFTPOS / register roll', 'ROLL', null, null),
      i('Cleaning chemicals / degreaser', 'EACH', null, null),
    ],
  },
];

export function weeklySheetCatalogCount(): number {
  return WEEKLY_SHEET_CATALOG.reduce((n, c) => n + c.items.length, 0);
}
