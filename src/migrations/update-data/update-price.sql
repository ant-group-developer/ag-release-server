-- ANT MUSIC LLC

UPDATE "releases"
SET "price_tier_id" = '2c7d2fc9-5b94-4966-bd88-63fe68b43b37'
WHERE EXISTS (
    SELECT 1
    FROM "tenants"
    WHERE "tenants"."id" = "releases"."tenant_id"
      AND LOWER(TRIM("tenants"."name")) = 'ant music llc'
);

UPDATE "tracks"
SET "price_tier_id" = '2c7d2fc9-5b94-4966-bd88-63fe68b43b37'
WHERE EXISTS (
    SELECT 1
    FROM "releases"
    INNER JOIN "tenants"
        ON "tenants"."id" = "releases"."tenant_id"
    WHERE "releases"."id" = "tracks"."release_id"
      AND LOWER(TRIM("tenants"."name")) = 'ant music llc'
);

-- CRE8TIVE

UPDATE "releases"
SET "price_tier_id" = '33571539-af88-49ac-a095-83dcf2f37996'
WHERE EXISTS (
    SELECT 1
    FROM "tenants"
    WHERE "tenants"."id" = "releases"."tenant_id"
      AND LOWER(TRIM("tenants"."name")) = 'cre8tive'
);

UPDATE "tracks"
SET "price_tier_id" = '33571539-af88-49ac-a095-83dcf2f37996'
WHERE EXISTS (
    SELECT 1
    FROM "releases"
    INNER JOIN "tenants"
        ON "tenants"."id" = "releases"."tenant_id"
    WHERE "releases"."id" = "tracks"."release_id"
      AND LOWER(TRIM("tenants"."name")) = 'cre8tive'
);