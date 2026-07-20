import { ClickHouseClient } from '@clickhouse/client';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { CLICKHOUSE_CLIENT } from './clickhouse.constants';

const MIGRATIONS_TABLE = 'clickhouse_migrations';

/**
 * ClickHouse Migration Service
 *
 * Runs pending SQL migrations on application startup, similar to TypeORM migrations.
 * Migration files are stored in src/migrations/clickhouse/ with naming convention:
 *   {NNN}_{description}.sql
 *
 * Features:
 * - Tracks applied migrations in `clickhouse_migrations` table
 * - Idempotent: all SQL uses IF NOT EXISTS / IF EXISTS
 * - Runs on every app start (onModuleInit)
 * - Splits SQL by semicolons and executes each statement
 */
@Injectable()
export class ClickHouseMigrationService implements OnModuleInit {
	private readonly logger = new Logger(ClickHouseMigrationService.name);
	private migrationPromise: Promise<void> = Promise.resolve();

	constructor(
		@Inject(CLICKHOUSE_CLIENT)
		private readonly client: ClickHouseClient,
	) {}

	onModuleInit() {
		this.migrationPromise = this.runMigrations();
	}

	private async runMigrations(): Promise<void> {
		try {
			await this.ensureMigrationsTable();
			await this.runPendingMigrations();
		} catch (error) {
			this.logger.error(
				`ClickHouse connection or migration failed. ClickHouse features will be unavailable. Error: ${error.message}`,
				error.stack,
			);
		}
	}

	async waitForMigrations(): Promise<void> {
		await this.migrationPromise;
	}

	/**
	 * Create the migrations tracking table if it doesn't exist.
	 */
	private async ensureMigrationsTable(): Promise<void> {
		await this.client.command({
			query: `
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE}
        (
            version    String,
            name       String,
            applied_at DateTime DEFAULT now()
        )
        ENGINE = MergeTree()
        ORDER BY (version)
        COMMENT 'Tracks applied ClickHouse schema migrations'
      `,
		});
	}

	/**
	 * Scan migration files, compare with applied, execute pending ones.
	 */
	private async runPendingMigrations(): Promise<void> {
		// 1. Get list of already applied migrations
		const applied = await this.getAppliedMigrations();
		this.logger.log(`Applied migrations: [${applied.join(', ')}]`);

		// 2. Scan migration files
		const migrationFiles = this.scanMigrationFiles();
		if (migrationFiles.length === 0) {
			this.logger.warn('No migration files found');
			return;
		}

		// 3. Find pending migrations
		const pending = migrationFiles.filter(
			(f) => !applied.includes(f.version),
		);

		if (pending.length === 0) {
			this.logger.log('All migrations are up to date ✅');
			return;
		}

		this.logger.log(
			`Pending migrations: ${pending.map((p) => p.version).join(', ')}`,
		);

		// 4. Execute each pending migration
		for (const migration of pending) {
			await this.executeMigration(migration);
		}

		this.logger.log(
			`Migration complete — applied ${pending.length} new migration(s) ✅`,
		);
	}

	/**
	 * Get versions of already applied migrations from the tracking table.
	 */
	private async getAppliedMigrations(): Promise<string[]> {
		const result = await this.client.query({
			query: `SELECT version FROM ${MIGRATIONS_TABLE} ORDER BY version`,
			format: 'JSONEachRow',
		});

		const rows = await result.json<{ version: string }>();
		return rows.map((r) => r.version);
	}

	/**
	 * Scan the migrations directory for .sql files.
	 * Returns sorted list of { version, name, filePath }.
	 */
	private scanMigrationFiles(): Array<{
		version: string;
		name: string;
		filePath: string;
	}> {
		// Resolve migrations directory relative to this file's location
		// In dev: src/migrations/clickhouse/
		// In prod (compiled): dist/src/migrations/clickhouse/ — but SQL files need to be copied
		const possiblePaths = [
			path.resolve(process.cwd(), 'src', 'migrations', 'clickhouse'),
			path.resolve(__dirname, '..', '..', 'migrations', 'clickhouse'),
		];

		let migrationsDir: string | null = null;
		for (const p of possiblePaths) {
			if (fs.existsSync(p)) {
				migrationsDir = p;
				break;
			}
		}

		if (!migrationsDir) {
			this.logger.warn(
				`Migrations directory not found. Searched: ${possiblePaths.join(', ')}`,
			);
			return [];
		}

		this.logger.log(`Migrations directory: ${migrationsDir}`);

		const files = fs
			.readdirSync(migrationsDir)
			.filter((f) => f.endsWith('.sql'))
			.sort(); // Alphabetical = version order (001_, 002_, ...)

		return files
			.map((fileName) => {
				const match = fileName.match(/^(\d+)_(.+)\.sql$/);
				if (!match) {
					this.logger.warn(
						`Skipping invalid migration file: ${fileName}`,
					);
					return null;
				}

				return {
					version: match[1], // "001"
					name: match[2], // "initial_schema"
					filePath: path.join(migrationsDir, fileName),
				};
			})
			.filter(Boolean) as Array<{
			version: string;
			name: string;
			filePath: string;
		}>;
	}

	/**
	 * Execute a single migration: read SQL, split by `;`, execute each statement.
	 */
	private async executeMigration(migration: {
		version: string;
		name: string;
		filePath: string;
	}): Promise<void> {
		this.logger.log(
			`▶ Running migration ${migration.version}: ${migration.name}`,
		);
		const startTime = Date.now();

		const sql = fs.readFileSync(migration.filePath, 'utf-8');

		const statements = this.splitStatements(sql);

		for (let i = 0; i < statements.length; i++) {
			const stmt = statements[i];
			try {
				await this.client.command({ query: stmt });
				this.logger.debug(
					`  Statement ${i + 1}/${statements.length} OK`,
				);
			} catch (error) {
				this.logger.error(
					`  Statement ${i + 1}/${statements.length} FAILED:\n${stmt.substring(0, 200)}...\n${error.message}`,
				);
				throw error;
			}
		}

		// Record migration as applied
		await this.client.command({
			query: `INSERT INTO ${MIGRATIONS_TABLE} (version, name) VALUES ('${migration.version}', '${migration.name}')`,
		});

		const duration = Date.now() - startTime;
		this.logger.log(
			`✅ Migration ${migration.version} applied (${duration}ms, ${statements.length} statements)`,
		);
	}

	/** Split SQL without treating semicolons inside literals or comments as delimiters. */
	private splitStatements(sql: string): string[] {
		const statements: string[] = [];
		let start = 0;
		let quote: string | null = null;
		let lineComment = false;
		let blockComment = false;

		for (let index = 0; index < sql.length; index++) {
			const char = sql[index];
			const next = sql[index + 1];

			if (lineComment) {
				if (char === '\n') lineComment = false;
				continue;
			}
			if (blockComment) {
				if (char === '*' && next === '/') {
					blockComment = false;
					index++;
				}
				continue;
			}
			if (quote) {
				if (char === '\\') {
					index++;
					continue;
				}
				if (char === quote) {
					if (quote === "'" && next === "'") {
						index++;
						continue;
					}
					quote = null;
				}
				continue;
			}
			if (char === '-' && next === '-') {
				lineComment = true;
				index++;
				continue;
			}
			if (char === '/' && next === '*') {
				blockComment = true;
				index++;
				continue;
			}
			if (char === "'" || char === '"' || char === '`') {
				quote = char;
				continue;
			}
			if (char === ';') {
				const statement = sql.slice(start, index).trim();
				if (statement.replace(/--.*$/gm, '').trim()) {
					statements.push(statement);
				}
				start = index + 1;
			}
		}

		const finalStatement = sql.slice(start).trim();
		if (finalStatement.replace(/--.*$/gm, '').trim()) {
			statements.push(finalStatement);
		}
		return statements;
	}
}
