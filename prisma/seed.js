const { PrismaClient, UserRole } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const TOPPING_SEED = [
  {
    categorySlug: 'meats',
    categoryLabel: 'Meats',
    toppings: [
      { slug: 'pepperoni', label: 'Pepperoni', priceDelta: 2.5 },
      { slug: 'ham', label: 'Leg Ham', priceDelta: 2.5 },
      { slug: 'salami', label: 'Hot Salami', priceDelta: 2.5 },
      { slug: 'bacon', label: 'Bacon', priceDelta: 3 },
      { slug: 'chicken', label: 'Chicken', priceDelta: 3.5 },
    ],
  },
  {
    categorySlug: 'cheeses',
    categoryLabel: 'Cheeses',
    toppings: [
      { slug: 'mozzarella', label: 'Extra Mozzarella', priceDelta: 2.5 },
      { slug: 'parmesan', label: 'Parmesan', priceDelta: 2 },
      { slug: 'fetta', label: 'Fetta', priceDelta: 2.5 },
      { slug: 'goat-cheese', label: 'Goat Cheese', priceDelta: 3 },
    ],
  },
  {
    categorySlug: 'veggies',
    categoryLabel: 'Veggies',
    toppings: [
      { slug: 'mushroom', label: 'Mushroom', priceDelta: 2 },
      { slug: 'capsicum', label: 'Capsicum', priceDelta: 1.5 },
      { slug: 'olives', label: 'Olives', priceDelta: 2 },
      { slug: 'basil', label: 'Fresh Basil', priceDelta: 1.5 },
      { slug: 'rocket', label: 'Rocket', priceDelta: 2 },
    ],
  },
];

const INGREDIENT_SEED = [
  {
    categorySlug: 'sauces',
    categoryLabel: 'Sauces',
    ingredients: [
      { slug: 'tomato-base', label: 'Tomato base' },
      { slug: 'napoli-sauce', label: 'Napoli sauce' },
      { slug: 'bbq-base', label: 'BBQ base' },
      { slug: 'white-sauce', label: 'White sauce' },
      { slug: 'garlic-oil', label: 'Garlic oil' },
    ],
  },
  {
    categorySlug: 'cheeses',
    categoryLabel: 'Cheeses',
    ingredients: [
      { slug: 'mozzarella', label: 'Mozzarella' },
      { slug: 'parmesan', label: 'Parmesan' },
      { slug: 'fetta', label: 'Fetta' },
      { slug: 'goat-cheese', label: 'Goat cheese' },
    ],
  },
  {
    categorySlug: 'proteins',
    categoryLabel: 'Proteins',
    ingredients: [
      { slug: 'pepperoni', label: 'Pepperoni' },
      { slug: 'leg-ham', label: 'Leg ham' },
      { slug: 'bacon', label: 'Bacon' },
      { slug: 'chicken', label: 'Chicken' },
      { slug: 'prawns', label: 'Prawns' },
      { slug: 'anchovies', label: 'Anchovies' },
    ],
  },
  {
    categorySlug: 'vegetables',
    categoryLabel: 'Vegetables',
    ingredients: [
      { slug: 'mushrooms', label: 'Mushrooms' },
      { slug: 'capsicum', label: 'Capsicum' },
      { slug: 'onion', label: 'Onion' },
      { slug: 'olives', label: 'Olives' },
      { slug: 'spinach', label: 'Spinach' },
      { slug: 'basil', label: 'Fresh basil' },
      { slug: 'rocket', label: 'Rocket' },
      { slug: 'pineapple', label: 'Pineapple' },
    ],
  },
  {
    categorySlug: 'herbs-spices',
    categoryLabel: 'Herbs & spices',
    ingredients: [
      { slug: 'oregano', label: 'Oregano' },
      { slug: 'chilli', label: 'Chilli' },
      { slug: 'garlic', label: 'Garlic' },
    ],
  },
];

const { MENU_SEED_ITEMS } = require('./menu-seed-data');
const { DEAL_SEED } = require('./deals-seed-data');

async function seedIngredients(prisma) {
  let categoriesCreated = 0;
  let ingredientsCreated = 0;

  for (const [categoryIndex, category] of INGREDIENT_SEED.entries()) {
    const existingCategory = await prisma.ingredientCategory.findUnique({
      where: { slug: category.categorySlug },
    });

    if (!existingCategory) {
      await prisma.ingredientCategory.create({
        data: {
          slug: category.categorySlug,
          label: category.categoryLabel,
          sortOrder: categoryIndex,
        },
      });
      categoriesCreated += 1;
    }

    for (const [index, ingredient] of category.ingredients.entries()) {
      const existing = await prisma.ingredient.findUnique({
        where: { slug: ingredient.slug },
      });

      if (existing) {
        continue;
      }

      await prisma.ingredient.create({
        data: {
          slug: ingredient.slug,
          label: ingredient.label,
          categorySlug: category.categorySlug,
          categoryLabel: category.categoryLabel,
          sortOrder: index,
        },
      });
      ingredientsCreated += 1;
    }
  }

  if (categoriesCreated > 0) {
    console.log(`Seeded ${categoriesCreated} ingredient categories.`);
  } else {
    console.log('Ingredient categories already seeded.');
  }

  if (ingredientsCreated > 0) {
    console.log(`Seeded ${ingredientsCreated} ingredients.`);
  } else {
    console.log('Ingredients already seeded.');
  }
}

async function seedDeals(prisma) {
  let created = 0;

  for (const deal of DEAL_SEED) {
    const existing = await prisma.deal.findUnique({
      where: { slug: deal.slug },
    });

    if (existing) {
      continue;
    }

    await prisma.deal.create({
      data: {
        slug: deal.slug,
        title: deal.title,
        description: deal.description,
        badgeLabel: deal.badgeLabel ?? null,
        discountType: deal.discountType,
        discountValue: deal.discountValue,
        promoCode: deal.promoCode ?? null,
        imageUrl: deal.imageUrl ?? null,
        imageAlt: deal.imageAlt ?? null,
        termsNote: deal.termsNote ?? null,
        ctaLabel: deal.ctaLabel ?? 'Order Now',
        ctaHref: deal.ctaHref ?? '/',
        sortOrder: deal.sortOrder ?? 0,
        isActive: true,
        isFeatured: deal.isFeatured ?? false,
      },
    });
    created += 1;
  }

  if (created > 0) {
    console.log(`Seeded ${created} deals.`);
  } else {
    console.log('Deals already seeded.');
  }
}

const CRUST_SEED = [
  { slug: 'classic', label: 'Classic Wood-fired', priceDelta: 0 },
  { slug: 'thin', label: 'Thin & Crispy', priceDelta: 0 },
  { slug: 'gluten-free', label: 'Gluten-Free', priceDelta: 3 },
];

async function seedMenuItems(prisma) {
  let created = 0;

  for (const item of MENU_SEED_ITEMS) {
    const existing = await prisma.menuItem.findUnique({
      where: { slug: item.slug },
    });

    if (existing) {
      continue;
    }

    await prisma.menuItem.create({
      data: {
        slug: item.slug,
        number: item.number,
        name: item.name,
        description: item.description,
        price: item.price,
        category: { connect: { slug: item.categorySlug } },
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
        badges: item.badges ?? [],
        ingredients: item.ingredients ?? [],
        priceNote: item.priceNote ?? null,
        sizeOptions: item.sizeOptions ?? undefined,
        isActive: true,
      },
    });
    created += 1;
  }

  if (created > 0) {
    console.log(`Seeded ${created} menu items.`);
  } else {
    console.log('Menu items already seeded.');
  }
}

async function seedCrusts(prisma) {
  let created = 0;

  for (const [index, crust] of CRUST_SEED.entries()) {
    const existing = await prisma.crustOption.findUnique({
      where: { slug: crust.slug },
    });

    if (existing) {
      continue;
    }

    await prisma.crustOption.create({
      data: {
        slug: crust.slug,
        label: crust.label,
        priceDelta: crust.priceDelta,
        sortOrder: index,
      },
    });
    created += 1;
  }

  if (created > 0) {
    console.log(`Seeded ${created} crust options.`);
  } else {
    console.log('Crust options already seeded.');
  }
}

async function seedToppings(prisma) {
  let categoriesCreated = 0;
  let toppingsCreated = 0;

  for (const [categoryIndex, category] of TOPPING_SEED.entries()) {
    const existingCategory = await prisma.toppingCategory.findUnique({
      where: { slug: category.categorySlug },
    });

    if (!existingCategory) {
      await prisma.toppingCategory.create({
        data: {
          slug: category.categorySlug,
          label: category.categoryLabel,
          sortOrder: categoryIndex,
        },
      });
      categoriesCreated += 1;
    }

    for (const [index, topping] of category.toppings.entries()) {
      const existing = await prisma.extraTopping.findUnique({
        where: { slug: topping.slug },
      });

      if (existing) {
        continue;
      }

      await prisma.extraTopping.create({
        data: {
          slug: topping.slug,
          label: topping.label,
          categorySlug: category.categorySlug,
          categoryLabel: category.categoryLabel,
          priceDelta: topping.priceDelta,
          sortOrder: index,
        },
      });
      toppingsCreated += 1;
    }
  }

  if (categoriesCreated > 0) {
    console.log(`Seeded ${categoriesCreated} topping categories.`);
  }

  if (toppingsCreated > 0) {
    console.log(`Seeded ${toppingsCreated} extra toppings.`);
  } else if (categoriesCreated === 0) {
    console.log('Extra toppings already seeded.');
  }
}

async function seedAdmin(prisma) {
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@leovorno.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026';
  const adminFirstName = process.env.ADMIN_SEED_FIRST_NAME ?? 'Leovorno';
  const adminLastName = process.env.ADMIN_SEED_LAST_NAME ?? 'Admin';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`Admin account already exists for ${adminEmail}.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.create({
    data: {
      email: adminEmail,
      password: passwordHash,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Seeded initial ADMIN account: ${adminEmail}`);
  console.log('Rotate ADMIN_SEED_PASSWORD immediately in production.');
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for seeding');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await seedAdmin(prisma);
    await seedCrusts(prisma);
    await seedToppings(prisma);
    await seedIngredients(prisma);
    await seedMenuItems(prisma);
    await seedDeals(prisma);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database seed failed:', error);
  process.exit(1);
});
