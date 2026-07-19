import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class PushDealDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetBrandSlugs!: string[];
}
