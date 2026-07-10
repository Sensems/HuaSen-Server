import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length, Matches, MinLength } from 'class-validator';

/**
 * 邮箱注册请求 DTO
 */
export class EmailRegisterDto {
  @ApiProperty({
    description: '邮箱',
    example: 'user@example.com',
    required: true,
  })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: '密码（≥8位，必须包含字母和数字）',
    example: 'Abc12345',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-zA-Z])(?=.*\d)/, {
    message: '密码必须包含至少一个字母和一个数字',
  })
  password!: string;

  @ApiProperty({
    description: '6位数字验证码',
    example: '482931',
    required: true,
  })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code!: string;
}
