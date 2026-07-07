import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { BRAND_SLUG_HEADER } from '../constants/brands';

export const BrandSlug = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      query: Record<string, string | string[] | undefined>;
    }>();

    const header = request.headers[BRAND_SLUG_HEADER];
    if (typeof header === 'string' && header.trim()) {
      return header.trim().toLowerCase();
    }

    const query = request.query.brand;
    if (typeof query === 'string' && query.trim()) {
      return query.trim().toLowerCase();
    }

    return undefined;
  },
);
