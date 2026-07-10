import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * 邮箱登录请求 DTO
 */
export class EmailLoginDto {
  @ApiProperty({
    description: '邮箱',
    example: 'user@example.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '密码',
    example: 'Abc12345',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  password!: string;
}
