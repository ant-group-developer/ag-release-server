import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';

export enum FieldOrderAggregator {
	name = `${OrmAlias.aggregator}.name`,
	createdAt = `${OrmAlias.aggregator}.createdAt`,
	dspUsageCount = `${OrmAlias.aggregator}.dspUsageCount`,
}

export enum AggregatorCode {
	CI = 'CI',
}
