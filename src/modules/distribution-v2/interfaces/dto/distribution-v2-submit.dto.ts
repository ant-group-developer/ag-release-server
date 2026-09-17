import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsOptional,
	IsString,
} from 'class-validator';

export class DistributionV2SubmitDto {
	@ApiProperty({
		type: [String],
		example: ['SPOTIFY', 'ANGHAMI'],
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	dspCodes!: string[];

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	needCiImport?: boolean;
}

export class DistributionV2ReviewRejectDto {
	@ApiProperty({ example: 'Bổ sung thông tin bản quyền' })
	@IsString()
	note!: string;
}
