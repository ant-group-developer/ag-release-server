import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class QueryGetListReleaseExecutionDto extends BaseQueryDto {
    @ApiPropertyOptional({ description: 'Filter by Release ID' })
    @IsOptional()
    @IsUUID()
    releaseId?: string;
}
