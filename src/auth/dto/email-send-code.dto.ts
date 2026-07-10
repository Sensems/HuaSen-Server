import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * 发送邮箱验证码请求 DTO
 */
export class EmailSendCodeDto {
  @ApiProperty({
    description: '接收验证码的邮箱',
    example: 'user@example.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}
