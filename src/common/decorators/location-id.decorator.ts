import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { LOCATION_ID_HEADER } from '../constants/brands';

export const LocationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      query: Record<string, string | string[] | undefined>;
    }>();

    const header = request.headers[LOCATION_ID_HEADER];
    if (typeof header === 'string' && header.trim()) {
      return header.trim();
    }

    const query = request.query.locationId;
    if (typeof query === 'string' && query.trim()) {
      return query.trim();
    }

    return undefined;
  },
);
