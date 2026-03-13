import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsUUID,
    IsString,
    IsOptional,
    IsIn,
    MaxLength,
    IsObject,
    IsEnum,
} from 'class-validator';
import { ReleaseDspDeliveryLogLevel } from '../enum/release-dsp-delivery-log.enum';

export class CreateReleaseDspDeliveryLogDto {
    @ApiProperty({
        description: 'ID của release liên quan tới log giao DSP',
    })
    @IsUUID()
    releaseId: string;

    @ApiProperty({
        description: 'ID của DSP nơi release được phân phối',
    })
    @IsString()
    dspId: string;

    @ApiProperty({
        description: 'Tiêu đề ngắn mô tả lỗi hoặc sự kiện',
        maxLength: 255,
    })
    @IsString()
    @MaxLength(255)
    title: string;

    @ApiPropertyOptional({
        description: 'Nội dung chi tiết của lỗi hoặc thông tin log',
    })
    @IsOptional()
    @IsString()
    content?: string;

    @ApiPropertyOptional({
        description: 'Mức độ log: ERROR | WARNING | INFO',
        default: 'ERROR',
    })
    @IsOptional()
    @IsString()
    @IsEnum(ReleaseDspDeliveryLogLevel, { each: true })
    level?: ReleaseDspDeliveryLogLevel;

    @ApiPropertyOptional({
        description:
            'Dữ liệu bổ sung dạng JSON: request payload, response từ DSP, stack trace...',
    })
    @IsOptional()
    @IsObject()
    metadata?: Record<string, any>;
}