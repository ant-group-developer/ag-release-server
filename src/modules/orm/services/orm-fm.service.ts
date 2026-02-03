export class OrmFmService {
	protected static mainAlias: string;

	protected static genFm(field: string) {
		return this.mainAlias + '.' + field;
	}
}
