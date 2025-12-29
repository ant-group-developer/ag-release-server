import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseStatus } from 'src/modules/release/enum/release.enum';

export class FilterDto extends BaseQueryDto2 {
	keyword?: string[];
	releaseStartCreatedAt?: Date;
	releaseEndCreatedAt?: Date;

	releaseIdsInclude?: string[];
	releaseIds?: string[];
	releaseTitle?: string;
	albumFormatId?: string[];
	primaryGenreId?: string[];
	subGenreId?: string[];
	labelId?: string[];
	artistId?: string[];
	startDateRelease?: Date;
	endDateRelease?: Date;
	status?: ReleaseStatus[];
	isVariousArtist?: boolean;

	trackStartCreatedAt?: Date;
	trackEndCreatedAt?: Date;
}
