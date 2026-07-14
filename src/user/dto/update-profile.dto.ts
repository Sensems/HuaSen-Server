import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

/**
 * 更新用户资料请求 DTO
 */
export class UpdateProfileDto {
  @ApiProperty({ required: false, example: '花森', description: '昵称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nickname?: string;

  @ApiProperty({
    required: false,
    example: 'https://cdn.example.com/a.png',
    description: '头像 URL',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @ValidateIf((_, v) => v !== undefined && v !== '')
  @IsUrl({ require_protocol: true })
  avatar?: string;
}
