export class FieldOrderCommon {
	protected static mainAlias = '';

	protected static genFm(field: string) {
		return this.mainAlias + '.' + field;
	}

	static get createdAt() {
		return this.genFm('createdAt');
	}
}
