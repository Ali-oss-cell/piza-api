import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApplyMenuTemplateDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetBrandSlugs!: string[];

  @IsOptional()
  @IsBoolean()
  lockItems?: boolean;
}
