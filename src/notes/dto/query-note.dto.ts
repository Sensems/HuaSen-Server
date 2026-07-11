import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { MediaType, $Enums } from "@prisma/client";
import { PaginationDto } from "../../common/dto/pagination.dto";

/**
 * 笔记列表查询参数
 */
export class QueryNoteDto extends PaginationDto {
  @ApiProperty({
    description: "笔记类型筛选（draft/published/archived）",
    required: false,
    example: "published",
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    description: "按分类 ID 筛选",
    required: false,
    example: "clxyz1234567890abcdef",
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({
    description: "按标签 ID 筛选（命中关联该标签的笔记）",
    required: false,
    example: "tag_abc123",
  })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({
    description: "关键词模糊搜索（匹配标题或正文）",
    required: false,
    example: "花森笔记",
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  /**
   * 按媒体类型筛选（命中关联该类型媒体的笔记）
   */
  @ApiProperty({
    enum: MediaType,
    required: false,
    description: "按媒体类型筛选",
    example: "IMAGE",
  })
  @IsOptional()
  @IsEnum($Enums.MediaType)
  mediaType?: $Enums.MediaType;
}
