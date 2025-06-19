import { BaseEntityShortId } from 'src/database/entities/database.entity';
import { ReleaseLanguage } from 'src/release-language/entities/release-language.entity';
import { TrackLanguage } from 'src/track-language/entities/track-language.entity';
import { Column, Entity, OneToMany } from 'typeorm';

console.log('Country')

@Entity('countries')
export class Country extends BaseEntityShortId {
	@Column({ name: 'name', type: 'varchar', length: 100, unique: true })
	name: string;

	@Column({ name: 'iso3', type: 'varchar', length: 10 })
	iso3: string;

	@Column({ name: 'iso2', type: 'varchar', length: 10 })
	iso2: string;

	@Column({ name: 'numeric_code', type: 'varchar', length: 10 })
	numericCode: string;

	@Column({ name: 'phone_code', type: 'varchar', length: 10 })
	phoneCode: string;

	@Column({ name: 'capital', type: 'varchar', length: 30 })
	capital: string;

	@Column({ name: 'currency', type: 'varchar', length: 10 })
	currency: string;

	@Column({ name: 'currency_name', type: 'varchar', length: 30 })
	currencyName: string;

	@Column({ name: 'currency_symbol', type: 'varchar', length: 10 })
	currencySymbol: string;

	@Column({ name: 'region_id', type: 'int' })
	regionId: number;

	@Column({ name: 'nationality', type: 'varchar', length: 30 })
	nationality: string;

	@OneToMany(
		() => TrackLanguage,
		(trackLanguage) => trackLanguage.metadataLanguageCountry,
	)
	trackLanguages: TrackLanguage[];

	@OneToMany(
		() => ReleaseLanguage,
		(releaseLanguage) => releaseLanguage.metadataLanguageCountry,
	)
	releaseLanguages: ReleaseLanguage[];
}
