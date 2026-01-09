import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { ReleaseLocalize } from 'src/modules/release-localize/entities/release-localize.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { TrackLocalize } from 'src/modules/track-localize/entities/track-localize.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('languages', {
	comment: 'Danh mục ngôn ngữ dùng cho metadata và nội dung release/track',
})
export class Language extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên ngôn ngữ',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_CODE,
		unique: true,
		comment: 'Mã ngôn ngữ (ví dụ: en, vi, ja)',
	})
	code: string;

	@OneToMany(
		() => ReleaseLocalize,
		(releaseLocalize) => releaseLocalize.language,
	)
	releaseLocalizes: ReleaseLocalize[];

	@OneToMany(
		() => ReleaseLanguage,
		(releaseAudioLanguage) => releaseAudioLanguage.audioLanguage,
	)
	releaseAudiolanguages: ReleaseLanguage[];

	@OneToMany(
		() => ReleaseLanguage,
		(releaseMetadataLanguage) => releaseMetadataLanguage.metadataLanguage,
	)
	releaseMetadataLanguages: ReleaseLanguage[];

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.audioLanguage,
	)
	trackAudioLanguages: TrackLanguage[];

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.metadataLanguage,
	)
	trackMetadataLanguages: TrackLanguage[];

	@OneToMany(() => TrackLocalize, (trackLocalize) => trackLocalize.language)
	trackLocalizes: TrackLocalize[];

	releaseLocalizesCount?: number;
	releaseAudiolanguagesCount?: number;
	releaseMetadataLanguagesCount?: number;
	trackAudioLanguagesCount?: number;
	trackMetadataLanguagesCount?: number;
	trackLocalizesCount?: number;
}
