import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';

export enum VevoVideoNotificationOperation {
	INSERT = 'insert',
	UPDATE = 'update',
	DELETE = 'delete',
	REPLACE = 'replace',
}

export enum VevoVideoNotificationStage {
	PRE = 'pre',
	POST = 'post',
}

export class VevoVideoNotificationDto {
	@ApiProperty({ example: 'channel-publish' })
	@IsString()
	name: string;

	@ApiProperty({ example: 'AYa4aVW7nx4WIxax_8sOfg' })
	@IsString()
	channel_id: string;

	@ApiProperty({ example: 'QZTAV2341939' })
	@IsString()
	isrc: string;

	@ApiProperty({ enum: VevoVideoNotificationOperation })
	@IsEnum(VevoVideoNotificationOperation)
	operation: VevoVideoNotificationOperation;

	@ApiProperty({ enum: VevoVideoNotificationStage })
	@IsEnum(VevoVideoNotificationStage)
	stage: VevoVideoNotificationStage;

	@ApiPropertyOptional({ example: 'EANRNz14yqE' })
	@IsOptional()
	@IsString()
	external_id?: string;

	@ApiProperty({ example: 'AYbmCNCoNj8AAAAAAAAAAA' })
	@IsString()
	id: string;

	@ApiProperty({ example: '2023-03-15T16:09:42.824Z' })
	@IsISO8601()
	created: string;
}
