import { ApiProperty } from '@nestjs/swagger';

/**
 * 用户资料响应 DTO
 */
export class UserProfileResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id!: string;

  @ApiProperty({ example: '花森', nullable: true })
  nickname!: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/a.png', nullable: true })
  avatar!: string | null;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({
    description: '6 位绑定码；可发到公众号完成绑定',
    example: 'ABC234',
    nullable: true,
  })
  bindingCode!: string | null;

  @ApiProperty({ description: '是否已绑定微信', example: false })
  wxBound!: boolean;
}
