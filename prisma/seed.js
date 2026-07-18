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
  {
    categorySlug: 'pasta-extras',
    categoryLabel: 'Pasta & sides extras',
    toppings: [
      { slug: 'extra-parmesan', label: 'Extra Parmesan', priceDelta: 2 },
      { slug: 'extra-bacon', label: 'Extra Bacon', priceDelta: 3 },
      { slug: 'extra-chicken', label: 'Extra Chicken', priceDelta: 3.5 },
      { slug: 'chilli-flakes', label: 'Chilli Flakes', priceDelta: 1 },
      { slug: 'garlic-bread-side', label: 'Garlic Bread Side', priceDelta: 6 },
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
  const leovorno = await ensureBrand(prisma, LEOVORNO_BRAND);
  let categoriesCreated = 0;
  let ingredientsCreated = 0;

  for (const [categoryIndex, category] of INGREDIENT_SEED.entries()) {
    const existingCategory = await prisma.ingredientCategory.findUnique({
      where: {
        brandId_slug: {
          brandId: leovorno.id,
          slug: category.categorySlug,
        },
      },
    });

    if (!existingCategory) {
      await prisma.ingredientCategory.create({
        data: {
          brandId: leovorno.id,
          slug: category.categorySlug,
          label: category.categoryLabel,
          sortOrder: categoryIndex,
        },
      });
      categoriesCreated += 1;
    }

    for (const [index, ingredient] of category.ingredients.entries()) {
      const existing = await prisma.ingredient.findUnique({
        where: {
          brandId_slug: {
            brandId: leovorno.id,
            slug: ingredient.slug,
          },
        },
      });

      if (existing) {
        continue;
      }

      await prisma.ingredient.create({
        data: {
          brandId: leovorno.id,
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
  const leovorno = await ensureBrand(prisma, LEOVORNO_BRAND);
  let created = 0;

  for (const deal of DEAL_SEED) {
    const existing = await prisma.deal.findUnique({
      where: {
        brandId_slug: {
          brandId: leovorno.id,
          slug: deal.slug,
        },
      },
    });

    if (existing) {
      continue;
    }

    await prisma.deal.create({
      data: {
        brandId: leovorno.id,
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

const LEOVORNO_BRAND = {
  id: 'a0000000-0000-0000-0000-000000000001',
  slug: 'leovorno',
  name: 'Leovorno',
  tagline: 'Pizza & Pasta Refined',
  primaryColor: '#D81B60',
};

const BUNNY_BOYS_BRAND = {
  id: 'a0000000-0000-0000-0000-000000000002',
  slug: 'bunny-boys',
  name: 'Bunny Boys',
  tagline: 'Burgers, wings & good times',
  primaryColor: '#FF6B35',
};

async function ensureBrand(prisma, brand) {
  return prisma.brand.upsert({
    where: { slug: brand.slug },
    update: {
      name: brand.name,
      tagline: brand.tagline,
      primaryColor: brand.primaryColor,
      isActive: true,
      status: 'LIVE',
    },
    create: {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      tagline: brand.tagline,
      primaryColor: brand.primaryColor,
      isActive: true,
      status: 'LIVE',
    },
  });
}

async function ensurePaymentSettings(prisma, storeId) {
  return prisma.storePaymentSettings.upsert({
    where: { storeId },
    update: {
      provider: 'CASH',
      cashEnabled: true,
    },
    create: {
      storeId,
      provider: 'CASH',
      cashEnabled: true,
      cardTerminalEnabled: false,
      cardOnlineEnabled: false,
    },
  });
}

async function ensurePathDomain(prisma, storeId, pathPrefix, isPrimary = true) {
  const existing = await prisma.storeDomain.findFirst({
    where: { storeId, pathPrefix },
  });

  if (existing) {
    return prisma.storeDomain.update({
      where: { id: existing.id },
      data: { isPrimary, isActive: true },
    });
  }

  return prisma.storeDomain.create({
    data: {
      storeId,
      pathPrefix,
      isPrimary,
      isActive: true,
    },
  });
}

async function ensureLocation(prisma, payload) {
  return prisma.location.upsert({
    where: {
      brandId_slug: {
        brandId: payload.brandId,
        slug: payload.slug,
      },
    },
    update: {
      name: payload.name,
      suburb: payload.suburb ?? null,
      address: payload.address ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      deliveryFee: payload.deliveryFee,
      minOrderAmount: payload.minOrderAmount,
      openingHours: payload.openingHours ?? null,
      isActive: true,
      isDefault: true,
    },
    create: {
      id: payload.id,
      brandId: payload.brandId,
      slug: payload.slug,
      name: payload.name,
      suburb: payload.suburb ?? null,
      address: payload.address ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      deliveryFee: payload.deliveryFee,
      minOrderAmount: payload.minOrderAmount,
      openingHours: payload.openingHours ?? null,
      isActive: true,
      isDefault: true,
    },
  });
}

async function seedBrandsAndLocations(prisma) {
  const leovorno = await ensureBrand(prisma, LEOVORNO_BRAND);
  const bunnyBoys = await ensureBrand(prisma, BUNNY_BOYS_BRAND);

  const settings = await prisma.storeSettings.findUnique({
    where: { id: '00000000-0000-0000-0000-000000000001' },
  });

  await ensureLocation(prisma, {
    id: 'b0000000-0000-0000-0000-000000000001',
    brandId: leovorno.id,
    slug: 'murrumbeena',
    name: 'Murrumbeena',
    suburb: 'Murrumbeena',
    address: settings?.address ?? null,
    phone: settings?.contactPhone ?? null,
    email: settings?.contactEmail ?? null,
    deliveryFee: settings?.deliveryFee ?? 5,
    minOrderAmount: settings?.minOrderAmount ?? 0,
    openingHours: settings?.openingHours ?? null,
  });

  await ensureLocation(prisma, {
    id: 'b0000000-0000-0000-0000-000000000002',
    brandId: bunnyBoys.id,
    slug: 'main',
    name: 'Bunny Boys',
    deliveryFee: 5,
    minOrderAmount: 0,
  });

  await ensurePaymentSettings(prisma, leovorno.id);
  await ensurePaymentSettings(prisma, bunnyBoys.id);
  await ensurePathDomain(prisma, leovorno.id, '/', true);
  await ensurePathDomain(prisma, bunnyBoys.id, '/bunny-boys', true);

  return { leovorno, bunnyBoys };
}

async function seedMenuCategories(prisma, brandId, menuItems) {
  const bySlug = new Map();
  for (const item of menuItems) {
    if (!bySlug.has(item.categorySlug)) {
      bySlug.set(item.categorySlug, {
        slug: item.categorySlug,
        label: item.categorySlug
          .split('-')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' '),
        supportsSizeOptions: Boolean(item.sizeOptions),
      });
    }
  }

  let sortOrder = 0;
  for (const category of bySlug.values()) {
    await prisma.menuCategory.upsert({
      where: {
        brandId_slug: {
          brandId,
          slug: category.slug,
        },
      },
      update: {
        label: category.label,
        sortOrder,
        supportsSizeOptions: category.supportsSizeOptions,
        supportsExtras: true,
        isActive: true,
      },
      create: {
        brandId,
        slug: category.slug,
        label: category.label,
        sortOrder,
        supportsSizeOptions: category.supportsSizeOptions,
        supportsExtras: true,
        isActive: true,
      },
    });
    sortOrder += 1;
  }
}

async function seedMenuItems(prisma) {
  const leovorno = await ensureBrand(prisma, LEOVORNO_BRAND);
  await seedMenuCategories(prisma, leovorno.id, MENU_SEED_ITEMS);

  let created = 0;

  for (const item of MENU_SEED_ITEMS) {
    const existing = await prisma.menuItem.findUnique({
      where: {
        brandId_slug: {
          brandId: leovorno.id,
          slug: item.slug,
        },
      },
    });

    if (existing) {
      continue;
    }

    await prisma.menuItem.create({
      data: {
        brandId: leovorno.id,
        slug: item.slug,
        number: item.number,
        name: item.name,
        description: item.description,
        price: item.price,
        categorySlug: item.categorySlug,
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
        badges: item.badges ?? [],
        ingredients: item.ingredients ?? [],
        priceNote: item.priceNote ?? null,
        sizeOptions: item.sizeOptions ?? null,
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
  const leovorno = await ensureBrand(prisma, LEOVORNO_BRAND);
  let created = 0;

  for (const [index, crust] of CRUST_SEED.entries()) {
    const existing = await prisma.crustOption.findUnique({
      where: {
        brandId_slug: {
          brandId: leovorno.id,
          slug: crust.slug,
        },
      },
    });

    if (existing) {
      continue;
    }

    await prisma.crustOption.create({
      data: {
        brandId: leovorno.id,
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
  const leovorno = await ensureBrand(prisma, LEOVORNO_BRAND);
  let categoriesCreated = 0;
  let toppingsCreated = 0;

  for (const [categoryIndex, category] of TOPPING_SEED.entries()) {
    const existingCategory = await prisma.toppingCategory.findUnique({
      where: {
        brandId_slug: {
          brandId: leovorno.id,
          slug: category.categorySlug,
        },
      },
    });

    if (!existingCategory) {
      await prisma.toppingCategory.create({
        data: {
          brandId: leovorno.id,
          slug: category.categorySlug,
          label: category.categoryLabel,
          sortOrder: categoryIndex,
        },
      });
      categoriesCreated += 1;
    }

    for (const [index, topping] of category.toppings.entries()) {
      const existing = await prisma.extraTopping.findUnique({
        where: {
          brandId_slug: {
            brandId: leovorno.id,
            slug: topping.slug,
          },
        },
      });

      if (existing) {
        continue;
      }

      await prisma.extraTopping.create({
        data: {
          brandId: leovorno.id,
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
    const { bunnyBoys } = await seedBrandsAndLocations(prisma);
    await seedAdmin(prisma);
    await seedCrusts(prisma);
    await seedToppings(prisma);
    await seedIngredients(prisma);
    await seedMenuItems(prisma);
    await seedDeals(prisma);
    await prisma.menuCategory.upsert({
      where: {
        brandId_slug: {
          brandId: bunnyBoys.id,
          slug: 'burgers',
        },
      },
      update: { label: 'Burgers', sortOrder: 0, isActive: true },
      create: {
        brandId: bunnyBoys.id,
        slug: 'burgers',
        label: 'Burgers',
        sortOrder: 0,
        supportsSizeOptions: false,
        supportsExtras: true,
        isActive: true,
      },
    });
    await prisma.menuCategory.upsert({
      where: {
        brandId_slug: {
          brandId: bunnyBoys.id,
          slug: 'sides',
        },
      },
      update: { label: 'Sides', sortOrder: 1, isActive: true },
      create: {
        brandId: bunnyBoys.id,
        slug: 'sides',
        label: 'Sides',
        sortOrder: 1,
        supportsSizeOptions: false,
        supportsExtras: false,
        isActive: true,
      },
    });
    await prisma.menuCategory.upsert({
      where: {
        brandId_slug: {
          brandId: bunnyBoys.id,
          slug: 'drinks',
        },
      },
      update: { label: 'Drinks', sortOrder: 2, isActive: true },
      create: {
        brandId: bunnyBoys.id,
        slug: 'drinks',
        label: 'Drinks',
        sortOrder: 2,
        supportsSizeOptions: false,
        supportsExtras: false,
        isActive: true,
      },
    });
    console.log('Seed completed for brands, admin, and Leovorno catalog.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Database seed failed:', error);
  process.exit(1);
});
