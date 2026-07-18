import { ApiProperty } from '@nestjs/swagger';

/** 统一成功响应外壳（与 ResponseInterceptor 一致） */
export class ApiResponseDto {
  @ApiProperty({ description: '业务码，0 表示成功', example: 0 })
  code!: number;

  @ApiProperty({ description: '提示信息', example: 'ok' })
  message!: string;

  @ApiProperty({
    description: '业务数据，无数据时为 null',
    nullable: true,
    example: null,
    type: 'object',
    additionalProperties: true,
  })
  data!: unknown;
}

/** 统一业务/校验错误响应外壳（与 GlobalExceptionFilter 一致） */
export class ApiErrorResponseDto {
  @ApiProperty({ description: '业务错误码', example: 10001 })
  code!: number;

  @ApiProperty({ description: '错误信息', example: '请求参数校验失败' })
  message!: string;

  @ApiProperty({
    description: '错误时一般为 null',
    example: null,
    nullable: true,
    type: 'object',
    additionalProperties: true,
  })
  data!: unknown;

  @ApiProperty({
    description: '校验细节（可选）',
    required: false,
    example: ['email must be an email'],
    nullable: true,
    type: 'array',
    items: { type: 'string' },
  })
  details?: unknown;
}
