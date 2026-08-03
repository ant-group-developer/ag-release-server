import { ApiPropertyOptional } from '@nestjs/swagger';
import {
	ArrayNotEmpty,
	IsArray,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import {
	YoutubeChannelSyncResult,
	YoutubeChannelSyncReviewStatus,
} from '../enum/youtube-channel-sync.enum';

export class QueryYoutubeChannelSyncItemsDto extends BaseQueryDto {
	@ApiPropertyOptional({ enum: YoutubeChannelSyncResult })
	@IsOptional()
	@IsEnum(YoutubeChannelSyncResult)
	syncResult?: YoutubeChannelSyncResult;

	@ApiPropertyOptional({ enum: YoutubeChannelSyncReviewStatus })
	@IsOptional()
	@IsEnum(YoutubeChannelSyncReviewStatus)
	reviewStatus?: YoutubeChannelSyncReviewStatus;
}

export class ApproveYoutubeChannelSyncItemsDto {
	@IsArray()
	@ArrayNotEmpty()
	@IsUUID('4', { each: true })
	itemIds: string[];
}

export class RejectYoutubeChannelSyncItemDto {
	@ApiPropertyOptional({ maxLength: 1000 })
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	note?: string;
}
