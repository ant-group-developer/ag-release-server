import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1779181063851 implements MigrationInterface {
	name = 'Migration1779181063851';

	private readonly domain =
		'https://ant-release-public.antmusic.net/';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE dsps
			SET picture = CONCAT('${this.domain}', picture)
			WHERE picture IS NOT NULL
			  AND picture NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE artists
			SET picture = CONCAT('${this.domain}', picture)
			WHERE picture IS NOT NULL
			  AND picture NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE genres
			SET picture = CONCAT('${this.domain}', picture)
			WHERE picture IS NOT NULL
			  AND picture NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE labels
			SET picture = CONCAT('${this.domain}', picture)
			WHERE picture IS NOT NULL
			  AND picture NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE news_posts_translation
			SET content = REPLACE(
				content,
				'src="/',
				'src="${this.domain}'
			)
			WHERE content IS NOT NULL;
		`);

		await queryRunner.query(`
			UPDATE news_posts
			SET thumbnail = CONCAT('${this.domain}', thumbnail)
			WHERE thumbnail IS NOT NULL
			  AND thumbnail NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE tenants
			SET logo = CONCAT('${this.domain}', logo)
			WHERE logo IS NOT NULL
			  AND logo NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE tenants
			SET icon = CONCAT('${this.domain}', icon)
			WHERE icon IS NOT NULL
			  AND icon NOT LIKE 'http%';
		`);

		await queryRunner.query(`
			UPDATE track_sensitives
			SET icon = CONCAT('${this.domain}', icon)
			WHERE icon IS NOT NULL
			  AND icon NOT LIKE 'http%';
		`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			UPDATE dsps
			SET picture = REPLACE(
				picture,
				'${this.domain}',
				''
			)
			WHERE picture LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE artists
			SET picture = REPLACE(
				picture,
				'${this.domain}',
				''
			)
			WHERE picture LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE genres
			SET picture = REPLACE(
				picture,
				'${this.domain}',
				''
			)
			WHERE picture LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE labels
			SET picture = REPLACE(
				picture,
				'${this.domain}',
				''
			)
			WHERE picture LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE news_posts_translation
			SET content = REPLACE(
				content,
				'src="${this.domain}',
				'src="/'
			)
			WHERE content IS NOT NULL;
		`);

		await queryRunner.query(`
			UPDATE news_posts
			SET thumbnail = REPLACE(
				thumbnail,
				'${this.domain}',
				''
			)
			WHERE thumbnail LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE tenants
			SET logo = REPLACE(
				logo,
				'${this.domain}',
				''
			)
			WHERE logo LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE tenants
			SET icon = REPLACE(
				icon,
				'${this.domain}',
				''
			)
			WHERE icon LIKE '${this.domain}%';
		`);

		await queryRunner.query(`
			UPDATE track_sensitives
			SET icon = REPLACE(
				icon,
				'${this.domain}',
				''
			)
			WHERE icon LIKE '${this.domain}%';
		`);
	}
}