import { FieldOrderCommon } from 'src/common/constants/common.class';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';

export enum DspDealVisibility {
	PUBLIC = 'PUBLIC',
	ADMIN_ONLY = 'ADMIN_ONLY',
}

export class FieldOrderDspDeal extends FieldOrderCommon {
	protected static mainAlias = OrmAlias.dspDeal;
}
