import {
  BeforeInsert,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export class BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 21 })
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  //   @BeforeInsert()
  //   generateId() {
  //     this.id = nanoid(10);
  //   }
}

export class FindOneDto {
  where: {
    field: string;
    value: string | null | undefined;
  };

  order?: {
    by: string;
    value: 'ASC' | 'DESC';
  };
}
