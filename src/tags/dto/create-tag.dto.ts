import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateTagDto {
  @ApiProperty({ description: '标签名称', example: '随笔', type: 'string', required: true, maxLength: 32 })
  @IsString()
  @MaxLength(32)
  name!: string;
}
