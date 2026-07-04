import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 删除文件请求 DTO
 * 用于 POST /storage/delete 接口
 */
export class DeleteFileDto {
  /** 七牛云对象存储的文件 key */
  @ApiProperty({
    description: '七牛云文件 key',
    example: 'notes/2026/07/image.jpg',
  })
  @IsNotEmpty()
  @IsString()
  key!: string;
}
