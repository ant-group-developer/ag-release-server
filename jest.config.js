module.exports = {
	moduleFileExtensions: ['js', 'json', 'ts'],
	rootDir: '.',
	testRegex: '.*\\.spec\\.ts$',
	transform: {
		'^.+\\.(t|j)s$': 'ts-jest',
	},
	testEnvironment: 'node',
	setupFiles: ['<rootDir>/test/jest-setup-env.ts'],
	moduleNameMapper: {
		'^src/(.*)$': '<rootDir>/src/$1',
	},
};
