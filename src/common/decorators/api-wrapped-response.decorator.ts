import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto, ApiResponseDto } from '../dto/api-response.dto';

type DataType = Type<unknown> | [Type<unknown>] | string;

/**
 * 文档化统一成功响应 { code, message, data }
 */
export function ApiWrappedOkResponse(options: {
  description?: string;
  dataDto?: DataType;
  dataExample?: unknown;
  isArray?: boolean;
}) {
  const { description = '成功', dataDto, dataExample, isArray } = options;
  const example = {
    code: 0,
    message: 'ok',
    data: dataExample === undefined ? null : dataExample,
  };

  const extraModels: Type<unknown>[] = [ApiResponseDto];
  if (dataDto && typeof dataDto !== 'string') {
    if (Array.isArray(dataDto)) {
      extraModels.push(dataDto[0]);
    } else {
      extraModels.push(dataDto);
    }
  }

  let dataSchema: Record<string, unknown>;
  if (!dataDto) {
    dataSchema = { nullable: true, example: null };
  } else if (isArray || Array.isArray(dataDto)) {
    const item = Array.isArray(dataDto) ? dataDto[0] : dataDto;
    dataSchema = {
      type: 'array',
      items: { $ref: getSchemaPath(item as Type<unknown>) },
    };
  } else if (typeof dataDto === 'string') {
    dataSchema = { type: dataDto };
  } else {
    dataSchema = { $ref: getSchemaPath(dataDto) };
  }

  return applyDecorators(
    ApiExtraModels(...extraModels),
    ApiOkResponse({
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(ApiResponseDto) },
          {
            properties: {
              data: dataSchema,
            },
          },
        ],
        example,
      },
    }),
  );
}

/**
 * 文档化统一错误响应（HTTP 200 + 业务 code）
 */
export function ApiWrappedErrorResponse(options: {
  description: string;
  example: { code: number; message: string; data?: null; details?: unknown };
}) {
  return applyDecorators(
    ApiExtraModels(ApiErrorResponseDto),
    ApiResponse({
      status: 200,
      description: options.description,
      schema: {
        allOf: [{ $ref: getSchemaPath(ApiErrorResponseDto) }],
        example: {
          data: null,
          details: null,
          ...options.example,
        },
      },
    }),
  );
}
