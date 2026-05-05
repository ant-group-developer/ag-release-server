import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777972773426 implements MigrationInterface {
    name = 'Migration1777972773426'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "release_submits" ADD "type" character varying(50) NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "release_submits"."type" IS 'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "release_submits"."type" IS 'Loại action: VD lần đầu phân phối (INITIAL) hay gỡ (TAKEDOWN)'`);
        await queryRunner.query(`ALTER TABLE "release_submits" DROP COLUMN "type"`);
    }

}
