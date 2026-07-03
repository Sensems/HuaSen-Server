import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 通用 ID 参数 DTO
 * 用于 delete、publish、archive 等只需要 id 的操作
 */
export class IdDto {
  @IsNotEmpty()
  @IsString()
  id!: string;
}
