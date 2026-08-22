import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSeoContentDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  ogImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;
}

export class BulkSeoContentItemDto {
  @IsString()
  @MinLength(1)
  page!: string;

  @IsString()
  @MinLength(1)
  section!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  ogImageUrl?: string;

  @IsOptional()
  @IsBoolean()
  robotsIndex?: boolean;
}

export class BulkSeoContentDto {
  @IsOptional()
  @IsUUID()
  domainId?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSeoContentItemDto)
  items!: BulkSeoContentItemDto[];
}

export class SaveBlogPostDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsUUID()
  domainId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  slug!: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  publishedAt?: string;

  @IsOptional()
  @IsString()
  status?: 'DRAFT' | 'PUBLISHED';

  @IsOptional()
  @IsUUID()
  thumbnailImageId?: string | null;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class CreateSeoImageDto {
  @IsOptional()
  @IsUUID()
  domainId?: string | null;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsString()
  altText?: string;
}
