// import { MigrationInterface, QueryRunner } from 'typeorm';

// export class UpdatePriceTiersByTenant1781084000000
// 	implements MigrationInterface
// {
// 	name = 'UpdatePriceTiersByTenant1781084000000';

// 	public async up(queryRunner: QueryRunner): Promise<void> {
// 		await queryRunner.query(`
// 			UPDATE "releases"
// 			SET "price_tier_id" = '2c7d2fc9-5b94-4966-bd88-63fe68b43b37'
// 			WHERE EXISTS (
// 				SELECT 1
// 				FROM "tenants"
// 				WHERE "tenants"."id" = "releases"."tenant_id"
// 					AND LOWER(TRIM("tenants"."name")) = 'ant music llc'
// 			)
// 		`);

// 		await queryRunner.query(`
// 			UPDATE "tracks"
// 			SET "price_tier_id" = '2c7d2fc9-5b94-4966-bd88-63fe68b43b37'
// 			WHERE EXISTS (
// 				SELECT 1
// 				FROM "releases"
// 				INNER JOIN "tenants"
// 					ON "tenants"."id" = "releases"."tenant_id"
// 				WHERE "releases"."id" = "tracks"."release_id"
// 					AND LOWER(TRIM("tenants"."name")) = 'ant music llc'
// 			)
// 		`);

// 		await queryRunner.query(`
// 			UPDATE "releases"
// 			SET "price_tier_id" = '33571539-af88-49ac-a095-83dcf2f37996'
// 			WHERE EXISTS (
// 				SELECT 1
// 				FROM "tenants"
// 				WHERE "tenants"."id" = "releases"."tenant_id"
// 					AND LOWER(TRIM("tenants"."name")) = 'cre8tive'
// 			)
// 		`);

// 		await queryRunner.query(`
// 			UPDATE "tracks"
// 			SET "price_tier_id" = '33571539-af88-49ac-a095-83dcf2f37996'
// 			WHERE EXISTS (
// 				SELECT 1
// 				FROM "releases"
// 				INNER JOIN "tenants"
// 					ON "tenants"."id" = "releases"."tenant_id"
// 				WHERE "releases"."id" = "tracks"."release_id"
// 					AND LOWER(TRIM("tenants"."name")) = 'cre8tive'
// 			)
// 		`);
// 	}

// 	public async down(_queryRunner: QueryRunner): Promise<void> {
// 		// Previous price tier values cannot be restored safely.
// 	}
// }
