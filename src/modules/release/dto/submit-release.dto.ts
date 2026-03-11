import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class SubmitReleaseDto {
	@ApiProperty({
		description: 'Danh sách code',
		example: ['A001', 'A002'],
		type: [String],
	})
	@IsArray()
	@IsString({ each: true })
	code: string[];
}
