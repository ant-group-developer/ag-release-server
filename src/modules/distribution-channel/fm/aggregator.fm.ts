import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { OrmFmService } from 'src/modules/orm/services/orm-fm.service';

export class AggregatorFm extends OrmFmService {
	protected static mainAlias = OrmAlias.aggregator;

	static code = this.genFm('code');
	static distributionChannels = this.genFm('distributionChannels');
}
