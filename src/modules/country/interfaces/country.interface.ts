export interface IContinentWithCountries {
	continentName: string;
	countries: string[];
}

export interface TreeNode {
	title: string;
	value: string;
	key: string;
	children?: TreeNode[];
}
