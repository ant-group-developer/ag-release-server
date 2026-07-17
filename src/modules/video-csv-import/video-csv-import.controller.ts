import {
	BadRequestException,
	Controller,
	Post,
	UploadedFile,
	UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { SystemAdminOnly } from 'src/modules/auth/decorators/auth.decorator';
import { VideoCsvImportResult } from './dto/video-csv-import-result.dto';
import { VideoCsvImportService } from './video-csv-import.service';

@ApiTags('Admin - Video CSV Import')
@Controller('admin/video-csv-import')
@SystemAdminOnly()
export class VideoCsvImportController {
	constructor(private readonly service: VideoCsvImportService) {}

	@Post()
	@UseInterceptors(FileInterceptor('file'))
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'CSV file (videoExports.csv format)',
		required: true,
		schema: {
			type: 'object',
			required: ['file'],
			properties: {
				file: {
					type: 'string',
					format: 'binary',
					description: 'File CSV (.csv). Max 10MB.',
				},
			},
		},
	})
	@ApiOperation({
		summary: 'Import video CSV de enrich channel_id cho video releases',
		description:
			'Upload CSV format videoExports.csv (multipart/form-data key = file). ' +
			'Voi moi row ISRC: match video existing de gan channelId (chi khi dang null) ' +
			'va externalId tu YouTube link, ' +
			'hoac tao moi release+video (fallback tenant ANT MUSIC LLC + label AMG). ' +
			'Channel name lookup case-insensitive theo channels.name. ' +
			'Khong overwrite channelId da co san; externalId chi cap nhat khi YouTube link hop le va khac gia tri hien tai.',
	})
	async import(
		@UploadedFile()
		file: {
			originalname?: string;
			buffer: Buffer;
			mimetype?: string;
			size?: number;
		},
	): Promise<ResponseSuccess<VideoCsvImportResult>> {
		if (!file) {
			throw new BadRequestException(
				'Missing file. Use multipart/form-data key = file',
			);
		}
		const filename = (file.originalname ?? '').toLowerCase();
		if (!filename.endsWith('.csv')) {
			throw new BadRequestException('Only .csv files are accepted');
		}
		const result = await this.service.importFromBuffer(file.buffer);
		return new ResponseSuccess({ data: result });
	}
}
