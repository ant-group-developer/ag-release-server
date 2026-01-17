import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { OrmFmService } from 'src/modules/orm/services/orm-fm.service';

export class TenantIntegrationFm extends OrmFmService {
	protected static mainAlias = OrmAlias.tenantIntegration;

	static dsp = this.genFm('dsp');
	static tenant = this.genFm('tenant');
	static distributionChannel = this.genFm('distributionChannel');
	static connections = this.genFm('connections');
	static isActive = this.genFm('isActive');

	static tenantId = this.genFm('tenantId');
	static dspId = this.genFm('dspId');
}
