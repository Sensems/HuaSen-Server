import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString } from 'class-validator';

/** 邮箱验证码用途 */
export const EMAIL_CODE_PURPOSES = ['register', 'reset_password'] as const;
export type EmailCodePurpose = (typeof EMAIL_CODE_PURPOSES)[number];

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

  @ApiProperty({
    description: '验证码用途：register 注册 / reset_password 重置密码',
    example: 'register',
    enum: EMAIL_CODE_PURPOSES,
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @IsIn(EMAIL_CODE_PURPOSES)
  purpose!: EmailCodePurpose;
}
