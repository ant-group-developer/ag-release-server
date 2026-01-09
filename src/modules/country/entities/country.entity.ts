import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('countries', {
	comment: 'Danh mục quốc gia, dùng cho metadata phát hành và bản ghi âm',
})
export class Country extends BaseUUIDEntity {
	@Column({
		type: 'varchar',
		length: DEFAULT_LENGTH_NAME,
		unique: true,
		comment: 'Tên quốc gia',
	})
	name: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Mã quốc gia ISO-3',
	})
	iso3: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Mã quốc gia ISO-2',
	})
	iso2: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Mã quốc gia dạng số',
	})
	numericCode: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Mã điện thoại quốc gia',
	})
	phoneCode: string;

	@Column({
		type: 'varchar',
		length: 30,
		comment: 'Thủ đô',
	})
	capital: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Mã tiền tệ',
	})
	currency: string;

	@Column({
		type: 'varchar',
		length: 30,
		comment: 'Tên tiền tệ',
	})
	currencyName: string;

	@Column({
		type: 'varchar',
		length: 10,
		comment: 'Ký hiệu tiền tệ',
	})
	currencySymbol: string;

	@Column({
		type: 'int',
		comment: 'ID khu vực (region)',
	})
	regionId: number;

	@Column({
		type: 'varchar',
		length: 30,
		comment: 'Quốc tịch',
	})
	nationality: string;

	@Column({
		type: 'varchar',
		length: 30,
		comment: 'Châu lục',
	})
	continent: string;

	@OneToMany(
		() => ReleaseLanguage,
		(releaseLanguage) => releaseLanguage.metadataLanguageCountry,
	)
	releaseMetadataLanguageCountries: ReleaseLanguage[];

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.metadataLanguageCountry,
	)
	trackMetadataLanguageCountries: TrackLanguage[];

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.recordingCountry,
	)
	trackRecordingCountries: TrackLanguage[];

	releaseMetadataLanguageCountriesCount?: number;
	trackMetadataLanguageCountriesCount?: number;
	trackRecordingCountriesCount?: number;
}
