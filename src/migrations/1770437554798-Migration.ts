import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1770437554798 implements MigrationInterface {
  name = 'Migration1770437554798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files"
      ALTER COLUMN "content_type" TYPE character varying(200)
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "files"."content_type"
      IS 'MIME type của file (ví dụ: audio/wav, image/png)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "files"
      ALTER COLUMN "content_type" TYPE character varying(30)
    `);
  }
}
