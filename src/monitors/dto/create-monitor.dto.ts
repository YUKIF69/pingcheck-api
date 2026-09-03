import {
  IsString,
  IsUrl,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class CreateMonitorDto {
  @IsString()
  name: string;

  @IsUrl()
  url: string;

  @IsInt()
  @Min(1)
  @Max(60)
  @IsOptional()
  intervalMinutes?: number;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsString()
  @IsOptional()
  slug?: string;
}
