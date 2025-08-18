import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseUUIDEntity } from 'src/common/entities/base.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import { TrackLanguage } from 'src/modules/track-language/entities/track-language.entity';
import { Column, Entity, OneToMany } from 'typeorm';

@Entity('countries')
export class Country extends BaseUUIDEntity {
	@Column({ type: 'varchar', length: DEFAULT_LENGTH_NAME, unique: true })
	name: string;

	@Column({ type: 'varchar', length: 10 })
	iso3: string;

	@Column({ type: 'varchar', length: 10 })
	iso2: string;

	@Column({ type: 'varchar', length: 10 })
	numericCode: string;

	@Column({ type: 'varchar', length: 10 })
	phoneCode: string;

	@Column({ type: 'varchar', length: 30 })
	capital: string;

	@Column({ type: 'varchar', length: 10 })
	currency: string;

	@Column({ type: 'varchar', length: 30 })
	currencyName: string;

	@Column({ type: 'varchar', length: 10 })
	currencySymbol: string;

	@Column({ type: 'int' })
	regionId: number;

	@Column({ type: 'varchar', length: 30 })
	nationality: string;

	@Column({ type: 'varchar', length: 30 })
	continent: string;

	// release
	@OneToMany(
		() => ReleaseLanguage,
		(releaseLanguage) => releaseLanguage.metadataLanguageCountry,
	)
	releaseMetadataLanguageCountries: ReleaseLanguage[];

	// relation
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

	// count relation
	releaseMetadataLanguageCountriesCount?: number;
	trackMetadataLanguageCountriesCount?: number;
	trackRecordingCountriesCount?: number;
}
