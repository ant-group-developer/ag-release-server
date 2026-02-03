import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { FieldOrderAggregator } from '../../aggregator/enum/distribution.enum';

export enum RoutingModeEnum {
	DIRECT = 'direct',
	AGGREGATOR = 'aggregator',
	SYSTEM = 'system',
}

export enum FieldOrderDspRoutingConfig {
	createdAt = `${OrmAlias.dspRoutingConfig}.createdAt`,
	updateAt = `${OrmAlias.dspRoutingConfig}.updateAt`,
	aggregatorName = FieldOrderAggregator.name,
}
