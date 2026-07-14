import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length } from 'class-validator';

/**
 * 微信空壳绑定码绑定请求 DTO
 */
export class BindUserDto {
  @ApiProperty({ example: 'ABC234', description: '微信空壳下发的绑定码' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  bindingCode!: string;
}
