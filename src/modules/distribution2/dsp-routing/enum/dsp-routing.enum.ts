import { FieldOrderCommon } from 'src/common/constants/common.class';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';

// export enum RoutingModeEnum {
// 	DIRECT = 'DIRECT',
// 	AGGREGATOR = 'AGGREGATOR',
// 	SYSTEM = 'SYSTEM',
// }

export class FieldOrderDspRouting extends FieldOrderCommon {
	protected static mainAlias = OrmAlias.dspRouting;
}
