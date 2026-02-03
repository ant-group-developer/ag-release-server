## What is commitlint

commitlint checks if your commit messages meet the [conventional commit format](https://conventionalcommits.org).

In general the pattern mostly looks like this:

```sh
type(scope?): subject  #scope is optional; multiple scopes are supported (current delimiter options: "/", "\" and ",")
```

Real world examples can look like this:

```text
chore: run tests on travis ci
```

```text
fix(server): send cors headers
```

```text
feat(blog): add comment section
```

Common types according to [commitlint-config-conventional (based on the Angular convention)](https://github.com/conventional-changelog/commitlint/tree/master/@commitlint/config-conventional#type-enum) can be:

- build
- chore
- ci
- docs
- feat
- fix
- perf
- refactor
- revert
- style
- test

## Build docker

```
docker compose -f docker-compose.prod.yml up --build -d
```

```
docker compose -f docker-compose.dev.yml up --build -d
```

## Set CORS for buckets

- Create json file:

```
echo '[{"origin": ["http://localhost:6200/", "https://release.antmusic.net/"],"responseHeader": ["*"],"method": ["*"],"maxAgeSeconds": 3600}]' > cors-config.json
```

- Set CORS for buckets:

```
gsutil cors set cors-config.json gs://ant-music-assets
```

```
gsutil cors set cors-config.json gs://ant-music-assets-protected
```

- View config CORS for buckets:

```
gsutil cors get gs://ant-music-assets
```

```
gsutil cors get gs://ant-music-assets-protected
```

## Generate secrets

- Create folder secrets

```
mkdir secrets
```

- Create private key

```
openssl genrsa -out "secrets/jwtRS256.key" 2048
```

- Create public key

```
openssl rsa -in "secrets/jwtRS256.key" -pubout -out "secrets/jwtRS256.key.pub"
```

sudo -u postgres /usr/local/pgsql/src/bin/psql/psql -d agrelease -c "GRANT USAGE, CREATE ON SCHEMA public TO agrelease;"

-- rule code
<module-name>/
├── const/
│ └── _.constant.ts # Success / Exception / messageCode
├── controllers/
│ └── _.controller.ts # HTTP layer
├── dto/
│ └── _.dto.ts # Request / Query DTO
├── entities/
│ └── _.entity.ts # TypeORM entities
├── enum/ | enums/
│ └── _.enum.ts # Enum nghiệp vụ
├── fm/
│ └── _.fm.ts # ORM Field Mapping (genFm)
├── services/
│ ├── _.service.ts # Business logic
│ └── _-query.service.ts # Query / listing logic
├── <module>.module.ts
