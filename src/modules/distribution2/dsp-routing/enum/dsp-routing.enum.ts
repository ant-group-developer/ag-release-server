import { FieldOrderCommon } from 'src/common/constants/common.class';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';

export enum RoutingModeEnum {
	SYSTEM = 'SYSTEM',
	AGGREGATOR = 'AGGREGATOR',
	DIRECT = 'DIRECT',
}

export class FieldOrderDspRouting extends FieldOrderCommon {
	protected static mainAlias = OrmAlias.dspRouting;
}
