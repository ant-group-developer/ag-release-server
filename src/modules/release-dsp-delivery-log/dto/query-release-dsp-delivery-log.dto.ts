import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsArray, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryGetListReleaseDspDeliveryLogDto extends BaseQueryDto {
    @ApiPropertyOptional({
        description: 'Lọc theo danh sách DSP ID, phân cách bởi dấu phẩy',
        example: 'uuid1,uuid2',
    })
    @IsOptional()
    @IsArray()
    @Transform(({ value }) =>
        typeof value === 'string' ? value.split(',') : value,
    )
    dspId?: string[];

    @ApiPropertyOptional({
        description: 'Lọc theo mức độ log, phân cách bởi dấu phẩy',
        example: 'ERROR,WARNING',
        enum: ['ERROR', 'WARNING', 'INFO'],
    })
    @IsOptional()
    @IsArray()
    @IsIn(['ERROR', 'WARNING', 'INFO'], { each: true })
    @Transform(({ value }) =>
        typeof value === 'string' ? value.split(',') : value,
    )
    level?: string[];
}