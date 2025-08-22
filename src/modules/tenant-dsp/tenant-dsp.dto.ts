import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsString, IsUUID, ValidateNested } from 'class-validator';

export class DspStatusDto {
	@ApiProperty()
	@IsString()
	dspId: string;

	@ApiProperty()
	@IsBoolean()
	isActive: boolean;
}

export class UpdateTenantDspDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID('4')
	tenantId: string;

	@ApiProperty({ type: [DspStatusDto] })
	@ValidateNested({ each: true })
	@Type(() => DspStatusDto)
	data: DspStatusDto[];
}
