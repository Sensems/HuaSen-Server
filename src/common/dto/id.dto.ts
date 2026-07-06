import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 通用 ID 参数 DTO
 * 用于 delete、publish、archive 等只需要 id 的操作
 */
export class IdDto {
  @ApiProperty({ description: '资源 ID（UUID）', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', type: 'string', required: true })
  @IsNotEmpty()
  @IsString()
  id!: string;
}
