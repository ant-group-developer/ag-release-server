import {
	Body,
	Controller,
	Get,
	Param,
	ParseUUIDPipe,
	Post,
	Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as path from 'path';
import { User } from 'src/common/decorators/req.decorators';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { UserReq } from 'src/common/interface/common.interface';
import { PublicRoute } from 'src/modules/auth/decorators/auth.decorator';
import {
	BulkCreateBucketDto,
	BulkSubmitDto,
	CreateBucketDto,
	GetUrlDownNonFile,
} from '../dto/bucket.dto';
import {
	CompleteMultipartUploadDto,
	InitiateMultipartUploadDto,
	PresignMultipartPartDto,
	PresignMultipartPartsDto,
} from '../dto/bucket.multipart.dto';
import { GeneratePublicUploadUrlDto } from '../dto/bucket.r2.dto';
import { BucketService2 } from '../services/bucket2.service';

@ApiTags('GCS Upload')
@Controller('bucket2')
export class BucketController2 {
	constructor(private readonly bucketService: BucketService2) {}

	// Multipart upload
	@Post('private/multipart/initiate')
	async initiateMultipartUpload(
		@Body() dto: InitiateMultipartUploadDto,
		@User() user: UserReq,
	) {
		const data = await this.bucketService.initiateMultipartUpload(
			dto,
			user,
		);
		return new ResponseSuccess({ data });
	}

	@Post('private/:id/multipart/presign-parts')
	async presignMultipartParts(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: PresignMultipartPartsDto,
		@User() user: UserReq,
	) {
		const data = await this.bucketService.presignMultipartParts(
			id,
			dto,
			user,
		);
		return new ResponseSuccess({ data });
	}

	@Post('private/:id/multipart/presign-part')
	async presignMultipartPart(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: PresignMultipartPartDto,
		@User() user: UserReq,
	) {
		const data = await this.bucketService.presignMultipartPart(
			id,
			dto,
			user,
		);
		return new ResponseSuccess({ data });
	}

	@Get('private/:id/multipart/parts')
	async listMultipartParts(
		@Param('id', ParseUUIDPipe) id: string,
		@User() user: UserReq,
	) {
		const data = await this.bucketService.listUploadedParts(id, user);
		return new ResponseSuccess({ data });
	}

	@Post('private/:id/multipart/complete')
	async completeMultipartUpload(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() dto: CompleteMultipartUploadDto,
		@User() user: UserReq,
	) {
		const data = await this.bucketService.completeMultipartUpload(
			id,
			dto,
			user,
		);
		return new ResponseSuccess({ data });
	}

	@Post('private/:id/multipart/abort')
	async abortMultipartUpload(
		@Param('id', ParseUUIDPipe) id: string,
		@User() user: UserReq,
	) {
		const data = await this.bucketService.abortMultipartUpload(id, user);
		return new ResponseSuccess({ data });
	}

	// create
	@Post('private')
	async create(@Body() data: CreateBucketDto) {
		const result = await this.bucketService.create(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('private/bulk')
	async bulkCreate(@Body() data: BulkCreateBucketDto) {
		const result = await this.bucketService.bulkCreate(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('private/bulk/submit')
	async bulkSubmit(@Body() data: BulkSubmitDto) {
		const result = await this.bucketService.bulkSubmit(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('private/:id/submit')
	async submit(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.submit(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	// read
	@PublicRoute()
	@Get('private/download-folder')
	async downloadFolder(@Query('prefix') prefix: string) {
		// Tạo tên thư mục duy nhất để tránh conflict
		const timestamp = Date.now();
		const destFolder = path.join(
			process.cwd(),
			'test_folder',
			`${prefix.replace(/\//g, '_')}_${timestamp}`,
		);

		const result = await this.bucketService.downloadFolder({
			prefix,
			destFolder,
			isPublic: false,
		});

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('private/:id/download')
	async getUrlDown(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getUrlDown(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('private/:id/read')
	async getUrlRead(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getUrlRead(id);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Get('private/:id')
	async getDetail(@Param('id', ParseUUIDPipe) id: string) {
		const result = await this.bucketService.getDetail(id);
		return new ResponseSuccess({
			data: result,
		});
	}

	// public: non file
	@Post('public/upload/presigned-url')
	async generatePublicPresignedUploadUrl(
		@Body() data: GeneratePublicUploadUrlDto,
	) {
		const result =
			await this.bucketService.generatePublicPresignedUploadUrl(data);

		return new ResponseSuccess({
			data: result,
		});
	}

	@Post('non-file/download')
	async getUrlDownNonFile(@Body() payload: GetUrlDownNonFile) {
		const data = await this.bucketService.getUrlDownNonFile(payload);

		return new ResponseSuccess({ data });
	}

	@Post('public/:urlPublic/delete')
	async deletePublic(@Param('urlPublic') urlPublic: string) {
		const decodedUrl = decodeURIComponent(urlPublic);
		return await this.bucketService.deletePublicFile(decodedUrl);
	}
}
