import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { SelectQueryBuilder } from 'typeorm';

export function orderAndPaging({
	qb,
	filter,
	alias,
}: {
	qb: SelectQueryBuilder<any>;
	filter: BaseQueryDto2;
	alias: string;
}) {
	const { fieldOrder, orderBy, skip, limit } = filter;

	qb.orderBy(`${alias}.${fieldOrder}`, orderBy).skip(skip).take(limit);
}
