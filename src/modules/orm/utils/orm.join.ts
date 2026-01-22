import { SelectQueryBuilder } from 'typeorm';
import { OrmAlias } from '../const/orm-alias.const';

export const dspRoutingLeftJoinDsp = ({
	qb,
}: {
	qb: SelectQueryBuilder<any>;
	alias?: string;
}) => {
	qb.leftJoinAndSelect(`${OrmAlias.dspRouting}.dsp`, OrmAlias.dsp);
};

export const dspRoutingLeftJoinDirectConfig = ({
	qb,
}: {
	qb: SelectQueryBuilder<any>;
	alias?: string;
}) => {
	qb.leftJoinAndSelect(`${OrmAlias.dspRouting}.directConfig`, 'directConfig');
};

export const dspRoutingLeftJoinSpecificAggregatorConfig = ({
	qb,
}: {
	qb: SelectQueryBuilder<any>;
	alias?: string;
}) => {
	qb.leftJoinAndSelect(
		`${OrmAlias.dspRouting}.specificAggregatorConfig`,
		'specificAggregatorConfig',
	);
};
