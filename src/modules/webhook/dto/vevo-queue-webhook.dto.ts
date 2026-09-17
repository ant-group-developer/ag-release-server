import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsBoolean,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsObject,
	IsOptional,
	IsString,
} from 'class-validator';
import {
	CiToolVevoJobResult,
	GetCiToolVevoJobResponse,
} from 'src/modules/partners-api/ci/interfaces/vevo-video.interface';

export class VevoQueueWebhookDto implements GetCiToolVevoJobResponse {
	@ApiProperty({
		example: 'e1b4e6915bff699f2b0aaab70dc584f7',
		description: 'jobId do CI Tool trả về khi submit queue',
	})
	@IsString()
	@IsNotEmpty()
	id: string;

	@ApiProperty({
		example: 'update',
		enum: ['full', 'update'],
	})
	@IsString()
	@IsIn(['full', 'update'])
	kind: string;

	@ApiProperty({
		example: 'completed',
		enum: ['completed', 'failed'],
	})
	@IsString()
	@IsIn(['completed', 'failed'])
	state: string;

	@ApiProperty({ example: 1 })
	@IsInt()
	attemptsMade: number;

	@ApiProperty({ example: 2 })
	@IsInt()
	maxAttempts: number;

	@ApiProperty({ example: 1789460305108 })
	@IsNumber()
	timestamp: number;

	@ApiPropertyOptional({
		example: 1789460305110,
		nullable: true,
	})
	@IsOptional()
	@IsNumber()
	processedAt?: number | null;

	@ApiPropertyOptional({
		example: 1789460325157,
		nullable: true,
	})
	@IsOptional()
	@IsNumber()
	finishedAt?: number | null;

	@ApiProperty({ example: 100 })
	@IsNumber()
	progress: number;

	@ApiPropertyOptional({
		type: Object,
		nullable: true,
	})
	@IsOptional()
	@IsObject()
	result?: CiToolVevoJobResult | null;

	@ApiPropertyOptional({ example: false })
	@IsOptional()
	@IsBoolean()
	debug?: boolean;
}
