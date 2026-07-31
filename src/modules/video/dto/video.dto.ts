import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	registerDecorator,
	ValidateIf,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator';
import {
	VideoAiContent,
	VideoMadeForKids,
	VideoVisibility,
} from '../entities/video.entity';

export function IsKeywordsLength(
	maxLength: number,
	validationOptions?: ValidationOptions,
) {
	return function (object: object, propertyName: string) {
		registerDecorator({
			name: 'isKeywordsLength',
			target: object.constructor,
			propertyName: propertyName,
			constraints: [maxLength],
			options: validationOptions,
			validator: {
				validate(value: any, args: ValidationArguments) {
					if (!value) return true;
					if (!Array.isArray(value)) return false;
					const [max] = args.constraints;
					const joined = value.join(',');
					return joined.length <= max;
				},
				defaultMessage(args: ValidationArguments) {
					const [max] = args.constraints;
					return `Tổng độ dài các từ khóa không được vượt quá ${max} ký tự`;
				},
			},
		});
	};
}

export class CreateVideoDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	@IsNotEmpty()
	releaseId: string;

	@ApiProperty({ maxLength: 20 })
	@IsString()
	@IsOptional()
	@MaxLength(20)
	isrc?: string;

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	externalId?: string | null;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	label?: string | null;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	labelId?: string | null;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	explicit?: boolean;

	@ApiPropertyOptional({
		enum: VideoAiContent,
		default: VideoAiContent.UNDETERMINED,
	})
	@IsOptional()
	@IsEnum(VideoAiContent)
	aiContent?: VideoAiContent;

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	channelId?: string | null;

	@ApiPropertyOptional({ maxLength: 5000 })
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	description?: string | null;

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@IsKeywordsLength(500)
	keywords?: string[] | null;

	@ApiPropertyOptional({
		enum: VideoMadeForKids,
		default: VideoMadeForKids.CHANNEL_DEFAULT,
	})
	@IsOptional()
	@IsEnum(VideoMadeForKids)
	madeForKids?: VideoMadeForKids;

	@ApiPropertyOptional({
		enum: VideoVisibility,
		default: VideoVisibility.DEFAULT,
	})
	@IsOptional()
	@IsEnum(VideoVisibility)
	visibility?: VideoVisibility;

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	contentProvider?: string | null;

	@ApiPropertyOptional({ maxLength: 150 })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	copyrightOwner?: string | null;

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	partnerCustomId1?: string | null;

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	partnerCustomId2?: string | null;

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	fileId?: string | null;
}

export class UpdateVideoDto extends PartialType(CreateVideoDto) {}

export class UpsertReleaseVideoDto extends PartialType(CreateVideoDto) {
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	releaseId?: string;
}
