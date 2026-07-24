import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Put,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UpsertSourceTypeConfigDto } from '../dto/source-type-config.dto';
import {
	SourceTypeConfigService,
	UploadedSourceTypeImage,
} from '../services/source-type-config.service';

@ApiTags('Analytics - Source Type Config')
@SystemAdminOnly()
@Controller('analytics/source-type-configs')
export class SourceTypeConfigController {
	constructor(private readonly sourceTypeConfigService: SourceTypeConfigService) {}

	@Get()
	@ApiOperation({ summary: 'List active and disabled analytics source type configs' })
	async list() {
		return new ResponseSuccess({
			data: await this.sourceTypeConfigService.list(),
		});
	}

	@Put(':sourceType')
	@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
	@ApiConsumes('application/json', 'multipart/form-data')
	@ApiBody({
		description:
			'Use imageUrl for an existing public image or multipart field file to upload an image to R2. When both are sent, file takes precedence.',
		schema: {
			type: 'object',
			required: ['label'],
			properties: {
				label: { type: 'string', example: 'Merlin' },
				imageUrl: {
					type: 'string',
					format: 'uri',
					nullable: true,
					example: 'https://cdn.example.com/analytics-sources/merlin.png',
				},
				file: {
					type: 'string',
					format: 'binary',
					description: 'JPEG, PNG, WEBP, or GIF image; maximum 5 MB.',
				},
			},
		},
	})
	@ApiOperation({
		summary: 'Create or update an analytics source type config with a URL or uploaded image',
	})
	async upsert(
		@Param('sourceType') sourceType: string,
		@Body() dto: UpsertSourceTypeConfigDto,
		@UploadedFile() file?: UploadedSourceTypeImage,
	) {
		return new ResponseSuccess({
			data: await this.sourceTypeConfigService.upsert(sourceType, dto, file),
		});
	}

	@Delete(':sourceType')
	@ApiOperation({ summary: 'Disable an analytics source type config' })
	async disable(@Param('sourceType') sourceType: string) {
		return new ResponseSuccess({
			data: await this.sourceTypeConfigService.disable(sourceType),
		});
	}
}
