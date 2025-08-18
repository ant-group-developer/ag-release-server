import { IsEnum, IsOptional } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderDspAction } from '../enums/dsp-action.enum';

export interface ICreateDspAction {
	dspId: string;
	actionId: string;
	isDefault: boolean;
}

export interface IUpdateDspAction {
	id: string;
	dspId?: string;
	actionId?: string;
	isDefault?: boolean;
}

export interface IBulkUpdateDspAction {
	dspId?: string;
	actionId?: string;
	isDefault?: boolean;
}

// dto
export class QueryGetListDspActionDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderDspAction)
	fieldOrder: FieldOrderDspAction.IS_DEFAULT = FieldOrderDspAction.IS_DEFAULT;
}
