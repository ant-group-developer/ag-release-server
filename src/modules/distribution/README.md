# LƯU Ý KHI LÀM VIỆC VỚI MODULE `distribution`

Khi AI hoặc Developer tham gia cấu trúc code hoặc thêm mới luồng tính năng vào module `src/modules/distribution`, cần tuân thủ các quy tắc và hiểu rõ domain knowledge cốt lõi của dự án như sau.

## 1. Domain Knowledge (Nghiệp vụ cốt lõi)
Module `distribution` chịu trách nhiệm quản lý việc cấu hình và đẩy nhạc (file audio, ảnh bìa cover, DDEX xml) tới các nền tảng phát hành nhạc (DSPs) hoặc các nhà phân phối trung gian lớn (Aggregators).

### Các Role & Entity chính trong module:

1. **`Aggregator` (Nhà phân phối tổng / Label)**: 
   - Quản lý các thông số định dạng chuẩn phân phối **DDEX** (`ddexVersion`, `ddexId`, `ddexName`). 
   - Đi kèm với cấu hình **SftpConfig** (Tỉ lệ 1-1) để hệ thống upload kho nhạc tới SFTP Server của Aggregator này định kỳ.
   - Thống kê: Có trường `dspUsageCount` đếm số DSP đang dùng Aggregator này (khi gỡ dsp hay gán dsp cần update số lượng này).

2. **`DspRoutingConfig` (Tuyến đường phân phối của 1 DSP)**: Mỗi nền tảng nhạc (DSP) chỉ có 1 Routing Config.
   - Quản lý cách thức đưa nhạc lên DSP này với 3 loại `mode` (RoutingModeEnum):
     - **`AGGREGATOR`**: Uỷ quyền, hệ thống đẩy nhạc thông qua SFTP Server của một `Aggregator` (Trỏ `aggregatorId`).
     - **`DIRECT`**: Trực tiếp, báo cáo thẳng tới server của DSP. Chiều này sẽ có một bản ghi **`SftpConfig` riêng biệt** liên kết với nó qua `sftpConfigId`.
     - **`SYSTEM`**: Hệ thống sẽ tự xử lý ngầm (tích hợp internal api hoặc không qua nhánh sftp upload).

3. **`SftpConfig` (Cấu hình Server tải/nhận Tệp)**: 
   - Nơi mã hóa và lưu trữ `metadata` (Host, Port, Username, Password/Private Key). 
   - Thực thể đa hình ảo (Polymorphic-ish): Thuộc vòng đời của `Aggregator` HOẶC vòng đời của luồng Direct trong `DspRoutingConfig`.

4. **`SftpConnectService` (Core Logic xử lý I/O Network)**: 
   - Wrapper bọc lớp giao tiếp với SFTP / SSH ngoài (`ssh2-sftp-client` và `spawn(scp)`). Luôn ưu tiên dùng các hàm như `uploadFolderScp` (tốc độ cao với process ngoài Linux), thay vì tự import gói mới tự deploy.

## 2. Technical Code Patterns (Quy tắc NestJS hiện tại)

- **Cấu trúc Module**: Domain-Driven Design (DDD) thu nhỏ. Chia thành các sub-module: `aggregator`, `dsp-routing`, `sftp-configs`, `sftp-connect` rồi gộp chung tại `DistributionModule` cha.
- **Phân tách Layer (CQRS light)**: 
   - Logic thay đổi dữ liệu (Mutations/Create/Update/Delete) được đặt trong các class `*.service.ts`.
   - Logic lấy dữ liệu liệt kê/Detail được tách sang `*.query.service.ts` để tránh classes cồng kềnh và circular injection cho các Service khác khi cần đọc dữ liệu.
- **RBAC Guard Guard**: Mọi controller endpoint trong module này bắt buộc có bảo mật cấp độ cao nhất thông qua decorator `@SystemAdminOnly()`.
- **Response Format**: Controller phải dùng chuẩn `*Success.COMMON(result)` lấy từ folder `const/*.const.ts` của riêng từng domain để serialize data cho client. 

## 3. Checklist khi triển khai luồng thay đổi

- **Khi tạo thêm Endpoint**: Đặt @ApiOperation() / @ApiResponse() / @ApiTags đầy đủ vì dự án dùng Swagger. Cần trỏ đúng DTO validation. 
- **Cẩn thận quan hệ 1-1 Cascade**: `Aggregator` tạo `SftpConfig` và `DspRoutingConfig` tạo `SftpConfig` (có ràng buộc RDBMS xoá Cascade trên Database Entity). Khi tạo/cập nhật cần để ý giao dịch (Transaction) tránh lưu dư rác ổ vào DB postgres/mysql. 
- **Khi Test SFTP**: Tái dụng API Controller của `SftpConfigController` (`POST /test`, `POST /:id/test`, `GET /:id/ls`) để chẩn đoán path/permission trước khi chèn code đè lên service.
