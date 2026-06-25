import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { ErnVersion2 } from 'src/modules/ern2/interfaces/ern-input.interface';
import { DspAgreementModeEnum } from '../entities/dsp-tenant.entity';
import { FieldOrderDsp } from '../enum/dsp.enum';

class CreateDspActionDto {
	@IsUUID()
	@IsNotEmpty()
	actionId: string;

	@IsBoolean()
	@IsOptional()
	isDefault: boolean = false;
}

export class CreateDspDto {
	@ApiProperty({
		description: 'Name of the DSP (Digital Service Provider)',
		maxLength: DEFAULT_LENGTH_NAME,
		example: 'Spotify',
	})
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value,
	)
	@Matches(/^[^_]+$/, {
		message: 'Name must not contain underscore (_)',
	})
	@IsNotEmpty()
	name: string;

	@IsOptional()
	@MaxLength(DEFAULT_LENGTH_CODE)
	codeCi?: string;

	@ApiProperty({
		description: 'Picture URL of the DSP',
		maxLength: LENGTH_PICTURE,
		required: false,
		type: 'string',
		example: 'http://example.com/logo.jpg',
	})
	@IsOptional()
	@IsString()
	@MaxLength(LENGTH_PICTURE)
	picture: string | null;

	@ApiProperty({
		description: 'Indicates whether the DSP can link to artist profiles',
		type: 'boolean',
		example: true,
	})
	@IsBoolean()
	isActive: boolean;

	@ApiProperty({
		description: 'Indicates whether the DSP is the default option',
		type: 'boolean',
		example: true,
	})
	@IsBoolean()
	isDefault: boolean;

	@IsBoolean()
	enablePolicy: boolean;

	@IsNotEmpty()
	@IsNotEmpty({ each: true })
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	@MaxLength(100, { each: true })
	formatLinks: string[];

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => CreateDspActionDto)
	dspActions?: CreateDspActionDto[];

	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	ddexId?: string | null;

	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	ddexName?: string | null;

	@IsOptional()
	@IsBoolean()
	hasDeal?: boolean;

	@ApiPropertyOptional({
		description: 'Type of the DSP (audio or video)',
		enum: ['audio', 'video'],
		default: 'audio',
	})
	@IsOptional()
	@IsEnum(['audio', 'video'])
	type?: 'audio' | 'video';
}

class UpdateDspActionDto {
	@IsUUID()
	@IsOptional()
	id?: string;

	@IsUUID()
	@IsNotEmpty()
	actionId: string;

	@IsBoolean()
	@IsOptional()
	isDefault: boolean = false;
}

export class UpdateDspDto extends PartialType(CreateDspDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsNotEmpty({ each: true })
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	@MaxLength(100, { each: true })
	formatLinks?: string[];

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => UpdateDspActionDto)
	dspActions?: UpdateDspActionDto[];
}

export class QueryGetListDspDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderDsp)
	fieldOrder: FieldOrderDsp = FieldOrderDsp.NAME;

	@IsOptional()
	aggregatorCode?: string;

	@ApiPropertyOptional({
		description: 'Filter DSPs by active status',
		type: Boolean,
	})
	@IsOptional()
	@Transform(({ value }) => {
		if (value === 'true') return true;
		if (value === 'false') return false;
		return value;
	})
	@IsBoolean()
	isActive?: boolean;
}

// DTO for tenant-dsp agreement
class AdminToggleDspItemDto {
	@ApiProperty({
		example: 'spotify',
	})
	@IsString()
	dspId: string;

	@ApiProperty({
		example: true,
	})
	@IsBoolean()
	isActive: boolean;
}
export class AdminToggleDspDto {
	@ApiProperty({
		type: [AdminToggleDspItemDto],
	})
	@IsArray()
	@ArrayNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => AdminToggleDspItemDto)
	items: AdminToggleDspItemDto[];
}

export class SftpMetadataDto {
	@ApiProperty()
	@IsString()
	host: string;

	@ApiProperty()
	@IsNumber()
	port: number;

	@ApiProperty()
	@IsString()
	username: string;

	@ApiPropertyOptional()
	@IsString()
	@IsOptional()
	password?: string;

	@ApiPropertyOptional()
	@IsString()
	@IsOptional()
	privateKey?: string;

	@ApiPropertyOptional()
	@IsString()
	@IsOptional()
	path?: string;
}
export class UpsertSftpConfigDto {
	@ApiPropertyOptional({ type: 'string', format: 'uuid' })
	@IsUUID()
	@IsOptional()
	id?: string;

	@ApiProperty({ enum: ErnVersion2 })
	@IsEnum(ErnVersion2)
	ernVersion: ErnVersion2;

	@ApiProperty()
	@ValidateNested()
	@Type(() => SftpMetadataDto)
	metadata: SftpMetadataDto;
}

export class UpdateTenantDspAgreementDto {
	@ApiPropertyOptional({ enum: DspAgreementModeEnum })
	@IsEnum(DspAgreementModeEnum)
	@IsOptional()
	mode?: DspAgreementModeEnum;

	@ApiPropertyOptional({ type: UpsertSftpConfigDto })
	@ValidateNested()
	@Type(() => UpsertSftpConfigDto)
	@IsOptional()
	sftpConfig?: UpsertSftpConfigDto;
}
