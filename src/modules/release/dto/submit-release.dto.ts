import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class SubmitReleaseDto {
	@ApiProperty({
		description: 'Danh sách code',
		example: ['A001', 'A002'],
		type: [String],
	})
	@IsArray()
	@IsString({ each: true })
	code: string[];

	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	needImportAgain?: boolean;
}
