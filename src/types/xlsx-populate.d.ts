declare module 'xlsx-populate' {
	const XlsxPopulate: {
		fromFileAsync(path: string): Promise<any>;
	};
	export default XlsxPopulate;
}
