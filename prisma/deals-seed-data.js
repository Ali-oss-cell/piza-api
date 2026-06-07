const DEFAULT_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBvLbch0jQ5PYw35jNjOwWrBuRd7eU_GlrTVGHvtPk_llIBerZFSgY2-RGO1dkxZpRa0FX5hKSYfkpRZWQRQksuFZZNgBNXgziC80aEEXAonKXkXEUYm4mwhAe2yXLjnYzXeQco1l4G3bHIp2nG1Qx7a-toviugVlrlrKmuQ3TJCB6mWpuKtKNdc6U62q70HyfIP3rarjnJI9-VWRee5BI3XwPb_CVeEzmfQrbaLax7OCoHPN4g82XSYhXqCFl6xZSnspMSAzb2QnU';

const DEAL_SEED = [
  {
    slug: 'family-pizza-night',
    title: 'Family Pizza Night',
    description: 'Order any Family size traditional pizza and get 15% off. Perfect for sharing at home.',
    badgeLabel: '15% OFF',
    discountType: 'PERCENTAGE',
    discountValue: 15,
    promoCode: 'FAMILY15',
    imageUrl: DEFAULT_IMAGE,
    imageAlt: 'Family pizza deal',
    termsNote: 'Valid on traditional pizzas, Family size only. Cannot be combined with other offers.',
    ctaLabel: 'Browse Pizzas',
    ctaHref: '/',
    sortOrder: 0,
    isFeatured: true,
  },
  {
    slug: 'pickup-special',
    title: 'Pickup Special',
    description: 'Save $5 when you pick up your order in-store. Skip the delivery fee and enjoy fresh-from-the-oven pizza.',
    badgeLabel: '$5 OFF',
    discountType: 'FIXED_AMOUNT',
    discountValue: 5,
    promoCode: 'PICKUP5',
    imageUrl: DEFAULT_IMAGE,
    imageAlt: 'Pickup special offer',
    termsNote: 'Pickup orders only. Minimum spend $25.',
    ctaLabel: 'Start Order',
    ctaHref: '/',
    sortOrder: 1,
    isFeatured: true,
  },
  {
    slug: 'lunch-pasta-deal',
    title: 'Lunch Pasta Deal',
    description: 'Any pasta from our menu for just $14 between 11am and 2pm, Monday to Friday.',
    badgeLabel: '$14 PASTA',
    discountType: 'FIXED_AMOUNT',
    discountValue: 3,
    promoCode: 'LUNCH14',
    imageUrl:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC5yUub-gFaFzYTjFWnB7J_iBn_4KZGGWcTgWHs-oigf3kxeOA4Djl5qWNCUs8QnxXS_B72UmaH2efHWc2jdtznv9rgLXe64Xid0O75UuFGXdfyuymhrD3tBrWWJMImVGBA623VogeCw4LomQB0quEZKkagAzz0PT1yV4ePik4fnlNMLHEClOSgGFw-xoskH6r4nQjoXrR48aViN-PcraJqPSXUWE4pRwdmuO-FF81V1RAAThJilErvbzRV1N_mXaX1RZr44Z-pBvA',
    imageAlt: 'Pasta lunch deal',
    termsNote: 'Weekday lunch hours only. Dine-in and pickup.',
    ctaLabel: 'View Pastas',
    ctaHref: '/',
    sortOrder: 2,
    isFeatured: false,
  },
];

module.exports = { DEAL_SEED };
