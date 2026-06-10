# Chiến lược xử lý Exchange Rate cho báo cáo doanh thu

Tài liệu mô tả cách xử lý quy đổi tỉ giá tiền tệ khi tổng hợp doanh thu từ các DSP (Digital Service Provider) sử dụng nhiều loại tiền tệ khác nhau (USD, EUR, GBP, JPY...).

---

## 1. Bối cảnh

Hệ thống hiện có **2 luồng dữ liệu doanh thu**:

| Luồng | Nguồn | Bảng lưu trữ | Cột Revenue | Vấn đề |
|---|---|---|---|---|
| **ClickHouse ETL** | FTP auto sync (Cron 2AM) | `fact_sales_report` | `revenue_usd`, `revenue_local`, `revenue_currency` | `revenue_usd = 0` khi DSP báo non-USD |
| **PostgreSQL** | Excel upload thủ công | `track_revenue` | `amount`, `currencyCode` | `SUM(amount)` trộn lẫn currencies |

Báo cáo doanh thu DSP được thống kê **theo từng tháng** (period `YYYYMM`).

---

## 2. So sánh 3 chiến lược Exchange Rate

### 2.1 Rate ngày đầu tháng (First-of-Month)

```
Period: 202506 → rate_date = 2025-06-01
1 EUR → 1.08 USD (rate ngày 1/6)
```

- ✅ Đơn giản, 1 rate/currency/tháng
- ✅ Frankfurter API: 1 request = `?base=USD&date=2025-06-01`
- ❌ Không phản ánh biến động trong tháng

### 2.2 Rate ngày cuối tháng (End-of-Month) ⭐ **KHUYẾN NGHỊ**

```
Period: 202506 → rate_date = 2025-06-30
1 EUR → 1.09 USD (rate ngày 30/6)
```

- ✅ Phản ánh giá trị tại thời điểm **chốt sổ** — chuẩn kế toán phổ biến
- ✅ Đơn giản, 1 rate/currency/tháng
- ✅ Phù hợp với cách DSP tính: "doanh thu tháng 6, quyết toán cuối tháng 6"
- ❌ Rate cuối tháng có thể chưa available nếu tháng chưa kết thúc

### 2.3 Rate trung bình tháng (Monthly Average)

```
Period: 202506 → avg(rate ngày 1→30/6)
1 EUR → 1.085 USD (trung bình)
```

- ✅ Chính xác nhất về mặt kinh tế (smooth out volatility)
- ❌ Phức tạp: cần fetch 20-22 rate/tháng rồi tính trung bình
- ❌ Frankfurter không có sẵn endpoint avg, phải tự tính

---

## 3. Quyết định: End-of-Month Rate

### Lý do chọn

1. **Chuẩn ngành music distribution** — IFPI, DDEX, và hầu hết aggregators (DistroKid, TuneCore, CD Baby) đều dùng EOM rate khi quy đổi settlement.

2. **Match với chu kỳ báo cáo DSP** — DSP chốt sổ cuối tháng, gửi report tháng sau. Rate cuối tháng phản ánh đúng thời điểm settlement.

3. **Đơn giản nhất** — chỉ cần lưu **1 rate per currency per month**. Bảng `exchange_rates` sẽ rất compact:
   ```
   Ví dụ 12 tháng × 10 currencies = 120 rows/năm
   ```

4. **Frankfurter API hỗ trợ hoàn hảo** — dùng `group=month` sẽ trả về rate cuối kỳ mỗi tháng.

### Xử lý tháng hiện tại (chưa kết thúc)

Tháng chưa chốt → dùng **rate mới nhất available** (latest), đánh dấu `is_provisional = true`. Khi tháng kết thúc, cron job tự cập nhật lại bằng EOM rate chính thức.

```
202506 (tháng hiện tại, chưa kết thúc):
  → rate_date = 2025-06-03 (latest), is_provisional = true
  → Sau 1/7: cron update lại rate_date = 2025-06-30, is_provisional = false
```

---

## 4. API Exchange Rate: Frankfurter

- **URL**: `https://api.frankfurter.dev`
- **API Key**: Không cần
- **Rate Limit**: Không giới hạn
- **Currencies**: 201 loại tiền (84 ngân hàng trung ương)
- **Historical**: Từ năm 1948
- **Self-host**: Có thể deploy Docker riêng

### Các endpoint sử dụng

```bash
# Tỉ giá mới nhất, base = USD
curl "https://api.frankfurter.dev/v2/rates?base=USD"

# Tỉ giá tại ngày cụ thể (historical)
curl "https://api.frankfurter.dev/v2/rates?base=USD&date=2025-06-01"

# Time series theo tháng (rate cuối mỗi tháng)
curl "https://api.frankfurter.dev/v2/rates?base=USD&from=2025-01-01&to=2025-06-30&group=month&quotes=EUR,GBP,JPY"

# 1 cặp tiền tệ cụ thể
curl "https://api.frankfurter.dev/v2/rate/EUR/USD?date=2025-03-15"
```

---

## 5. Schema đề xuất

### PostgreSQL: Bảng `exchange_rates`

```sql
CREATE TABLE exchange_rates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_code   VARCHAR(3) NOT NULL,          -- EUR, GBP, JPY
  rate_to_usd     DECIMAL(18, 8) NOT NULL,      -- 1 USD = ? local (inverse)
  period          VARCHAR(7) NOT NULL,           -- '2025-06' (monthly key)
  rate_date       DATE NOT NULL,                 -- actual date of the rate used
  is_provisional  BOOLEAN DEFAULT false,         -- true = tháng chưa chốt
  source          VARCHAR(50) DEFAULT 'frankfurter',
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (currency_code, period)
);
```

### ClickHouse: Bảng `exchange_rates` (sync từ PG)

```sql
CREATE TABLE IF NOT EXISTS music_analytics.exchange_rates (
    currency_code   LowCardinality(String),
    rate_to_usd     Decimal64(8),
    period          String,               -- '2025-06'
    rate_date       Date,
    is_provisional  UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree()
ORDER BY (currency_code, period)
COMMENT 'Exchange rates synced from PostgreSQL — EOM rates';
```

---

## 6. Cách sử dụng khi Query

### ClickHouse: Quy đổi revenue về USD

```sql
SELECT
  formatDateTime(s.reporting_period_start, '%Y-%m') AS period,
  s.dsp_id,
  SUM(s.quantity) AS total_streams,
  SUM(
    CASE
      WHEN s.revenue_currency = 'USD' THEN s.revenue_local
      WHEN s.revenue_usd > 0 THEN s.revenue_usd
      ELSE s.revenue_local / er.rate_to_usd
    END
  ) AS total_revenue_usd
FROM music_analytics.fact_sales_report s
LEFT JOIN music_analytics.exchange_rates er
  ON s.revenue_currency = er.currency_code
  AND formatDateTime(s.reporting_period_start, '%Y-%m') = er.period
GROUP BY period, s.dsp_id
ORDER BY period
```

### PostgreSQL: Quy đổi track_revenue về USD

```sql
SELECT
  TO_CHAR(tr.report_date, 'YYYY-MM') AS period,
  dsp.name AS dsp_name,
  SUM(
    CASE
      WHEN tr.currency_code = 'USD' THEN tr.amount
      ELSE tr.amount / er.rate_to_usd
    END
  ) AS total_revenue_usd,
  COUNT(DISTINCT tr.id) AS total_records
FROM track_revenue tr
LEFT JOIN exchange_rates er
  ON tr.currency_code = er.currency_code
  AND TO_CHAR(tr.report_date, 'YYYY-MM') = er.period
LEFT JOIN dsps dsp ON tr.dsp_id = dsp.id
GROUP BY period, dsp.name
ORDER BY period
```

---

## 7. Cron Job: Tự động cập nhật tỉ giá

```
Lịch chạy: 0 6 1 * *  (6AM ngày 1 mỗi tháng)

Quy trình:
1. Fetch EOM rate của tháng trước từ Frankfurter API
2. Upsert vào bảng exchange_rates (PG) với is_provisional = false
3. Sync sang ClickHouse exchange_rates
4. Cập nhật rate provisional của tháng hiện tại = latest rate
5. Xóa cache Redis analytics:*
```

---

## 8. Fallback khi thiếu rate

| Trường hợp | Fallback |
|---|---|
| Currency không có trong Frankfurter | Admin nhập thủ công qua CRUD API |
| Rate chưa available (tháng hiện tại) | Dùng latest rate, `is_provisional = true` |
| Không có rate nào match | `rate_to_usd = 1` (treat as USD) + log warning |
