AM-283 feat(app-setting): Setting Prefix ISRC, UPC, API Key

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

## Process roles (api / worker)

App chạy cùng 1 codebase nhưng tách thành 2 loại process, quyết định bởi biến môi trường `APP_ROLE` (xem `src/main.ts`):

- `APP_ROLE=api` (mặc định) — HTTP server, nhận request. **Mọi `@Cron` mặc định bị tắt.**
- `APP_ROLE=worker` — không mở HTTP port, chạy cron + BullMQ worker + background jobs.

Mục đích: tách tải (api lo request, worker lo nền) và tránh cron chạy trùng khi scale nhiều instance api.

Docker compose đã dựng sẵn 2 service tương ứng (`app-dev` / `app-dev-worker`). Chạy local như worker để test cron:

```
APP_ROLE=worker yarn start:prod
```

**Nguồn sự thật duy nhất cho role**: `src/common/constants/app-role.ts` (`AppRole`, `currentRole()`, `isWorker()`). Đừng hardcode chuỗi `'worker'`/`'api'` hay đọc `process.env.APP_ROLE` rải rác — import từ file này.

### Thêm một cron job (`@Cron`)

Cron được `@nestjs/schedule` đăng ký toàn cục, sau đó `ScheduleService` gỡ các cron **không hợp role** hiện tại (theo `src/modules/schedule/cron-role-map.ts`). Vì vậy khi thêm cron mới:

1. Đặt tên cho cron: `@Cron(expr, { name: CRON_JOBS.MY_JOB })` — tên khai trong `src/modules/schedule/cron-job-names.ts`.
2. Khai role được phép chạy trong `cron-role-map.ts`.

Cron **không khai** trong map mặc định chỉ chạy ở `worker`. Muốn đổi role của cron về sau: sửa duy nhất trong `cron-role-map.ts`.

Lưu ý scale: nếu cho cron chạy ở `api` mà có nhiều instance api, cron sẽ fire ở mọi instance cùng lúc. Chỉ an toàn với cron tự chống trùng (vd `outbox-relay` dùng `SELECT ... FOR UPDATE SKIP LOCKED`); cron tác dụng phụ (backup, gửi mail) phải giữ ở `worker` cho tới khi có distributed lock.

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
