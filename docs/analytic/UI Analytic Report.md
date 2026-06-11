# Tài liệu: Giao diện và Cấu trúc trang Analytics (Phân tích dữ liệu)

Tài liệu này tổng hợp chi tiết toàn bộ cấu trúc giao diện, các thành phần (components/sub-components) và các chức năng đi kèm của trang **Analytics** (`app/[locale]/(cms)/analytics2/page.tsx`) trong dự án Frontend `ag-release-client`.

---

## 📐 1. Cấu trúc tổng quan (Page Layout)
Trang Analytics sử dụng component `<PageContainer>` từ thư viện `@ant-design/pro-components` để dựng layout chuẩn quản trị viên (CMS).

*   **Đường dẫn trang**: `/analytics2`
*   **Tiêu đề trang**: `Thống kê` (hoặc `Statistic` theo ngôn ngữ được chọn).
*   **Thành phần chính**: Bao gồm **Thanh bộ lọc & Action** ở Header và **5 vùng giao diện chính** ở Body được xếp chồng dọc (flex-col gap-6).

---

## 🛠️ 2. Chi tiết các thành phần ở Header (Page Header Actions)
Nằm ở góc trên bên phải của trang, cung cấp các bộ lọc và tác vụ đồng bộ hóa toàn cục:

### A. Bộ lọc thời gian (`DateSelect`)
*   **Chức năng**: Chọn khoảng thời gian bắt đầu (`startDate`) và kết thúc (`endDate`).
*   **Cấu trúc giao diện**: 
    *   Dropdown chọn nhanh các mốc thời gian phổ biến hoặc chọn khoảng thời gian tùy chỉnh (Custom Range).
    *   Dữ liệu sau khi chọn sẽ cập nhật lại `fromDate` và `toDate` trên toàn bộ trang để reload lại các API tương ứng.
*   **Giá trị mặc định**: Từ đầu tháng của 5 tháng trước tới cuối tháng hiện tại.

### B. Nút đồng bộ hóa dữ liệu (`SyncAllButton`)
*   **Chức năng**: Kích hoạt tiến trình đồng bộ dữ liệu thủ công từ FTP về hệ thống.
*   **Giao diện & Sub-components**:
    *   Nút bấm **Đồng bộ tất cả** (được bọc bởi `Tooltip` hiển thị trạng thái "Đang đồng bộ..." nếu đang chạy).
    *   Hộp thoại Modal cấu hình (`Modal`):
        *   **Dropdown chọn chế độ (`Select`)**: Đồng bộ tháng đơn lẻ (`Single period`) hoặc Đồng bộ từ mốc thời gian chỉ định (`From period`).
        *   **Trình chọn tháng (`DatePicker` dạng month)**: Định dạng hiển thị `MM/YYYY` (truyền lên API dạng `YYYYMM`).
        *   **Công tắc Force Sync (`Switch`)**: Cho phép ghi đè/ép buộc đồng bộ lại dữ liệu cũ.

---

## 📊 3. Chi tiết các thành phần Body (Dashboard Components)

Trang hiển thị dữ liệu phân tích thông qua 5 khối component chính từ trên xuống dưới:

### 1️⃣ Metric Cards (`MetricCards`)
*   **Chức năng**: Hiển thị tổng số lượng thực thể hệ thống trong khoảng thời gian đã lọc.
*   **Các thẻ hiển thị**:
    1.  **Release (Bản phát hành)**: Kèm biểu tượng Đĩa nhạc (`DiscAlbum`), màu sắc tím nhạt.
    2.  **Track (Bài nhạc)**: Kèm biểu tượng Nốt nhạc (`Music`), màu sắc xanh cyan nhạt.
    3.  **Label (Hãng đĩa)**: Kèm biểu tượng Tòa nhà (`Building2`), màu sắc hồng nhạt.
    4.  **Artist (Nghệ sĩ)**: Kèm biểu tượng Người dùng (`Users`), màu sắc xanh indigo nhạt.
*   **Chi tiết giao diện**:
    *   Sử dụng cấu trúc lưới responsive (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).
    *   Hiệu ứng Skeleton dạng Pulse trong lúc tải dữ liệu.
    *   Hiển thị phần trăm tăng trưởng/xu hướng của từng thẻ (ví dụ: `+12%`, `Stable`, `+3` kèm mũi tên màu xanh nếu tăng trưởng dương).

### 2️⃣ Thống kê lượt xem hàng tháng theo DSP (`AnalyticsChart`)
*   **Chức năng**: Biểu đồ phân tích lượng xem tích lũy hàng tháng phân chia theo nhà phân phối nhạc (DSP).
*   **Các thành phần điều khiển**:
    *   **Bộ nút chuyển đổi Radio (`Radio.Group`)**:
        *   **Xu hướng (Trends)**: Xem biểu đồ lượt xem xu hướng hàng tháng (Gọi API `/analytics/trend-view/dsp/timeline`).
        *   **Doanh số (Sales)**: Xem biểu đồ lượt xem doanh số hàng tháng (Gọi API `/analytics/sales-view/dsp/timeline`).
*   **Cấu trúc biểu đồ**:
    *   Vẽ biểu đồ cột chồng (`BarView` sử dụng Recharts) hiển thị dữ liệu theo từng tháng (`period` dạng `YYYY-MM`).
    *   Mỗi cột hiển thị tối đa Top 5 DSP hàng đầu và nhóm các DSP còn lại thành cột `Other` (Màu xám `#94a3b8`).
    *   Các cột DSP có màu sắc phân biệt sinh động từ bảng palette màu chuẩn của hệ thống.

### 3️⃣ Thống kê lượt xem hàng ngày theo DSP (`AnalyticsDailyChart`)
*   **Chức năng**: Biểu đồ phân tích lượng xem chi tiết theo từng ngày gần nhất.
*   **Các thành phần điều khiển**:
    *   **Dropdown chọn khoảng thời gian (`Select`)**:
        *   7 ngày gần nhất (Last 7 days)
        *   15 ngày gần nhất (Last 15 days)
        *   30 ngày gần nhất (Last 30 days)
    *   Sau khi chọn, component tự tính toán ngày bắt đầu/kết thúc lùi từ ngày hiện tại và gọi API `/analytics/trend-view/dsp/timeline/daily`.
*   **Cấu trúc biểu đồ**:
    *   Biểu đồ cột chồng tương tự biểu đồ tháng nhưng trục hoành hiển thị chi tiết theo ngày (`YYYY-MM-DD`).

### 4️⃣ Bảng xếp hạng Top thực thể (`TracksArtistsTable`)
*   **Chức năng**: Hiển thị bảng xếp hạng thành tích của các thực thể hàng đầu.
*   **Bộ lọc phụ**: Dropdown cho phép chuyển đổi hiển thị giữa **Top 5** hoặc **Top 10**.
*   **Các Tab giao diện (`Tabs`)**:
    *   **Tab Bài nhạc (Tracks)**: Bảng xếp hạng bài hát theo lượt stream (gồm Thứ hạng, Bài nhạc kèm ảnh bìa, Nghệ sĩ, mã ISRC, Bản phát hành chứa bài hát, Tổng lượt Stream).
    *   **Tab Bản phát hành (Releases)**: Xếp hạng bản phát hành (gồm Thứ hạng, Tên bản phát hành kèm ảnh bìa, Hãng đĩa, mã UPC, Số lượng bài hát con, Tổng lượt Stream).
    *   **Tab Đối tác (Partners/Artists)**: Xếp hạng nghệ sĩ (gồm Thứ hạng, Nghệ sĩ kèm ảnh đại diện, Số bài hát, Tổng lượt Stream).
    *   **Tab Hãng đĩa (Labels)**: Xếp hạng hãng đĩa (gồm Thứ hạng, Hãng đĩa kèm ảnh đại diện, Số bản phát hành, Số bài hát, Tổng lượt Stream).

### 5️⃣ Bảng bản phát hành gần đây (`RecentReleasesTable`)
*   **Chức năng**: Danh sách các bản phát hành mới nhất được phân phối trong khoảng thời gian được lọc.
*   **Các cột dữ liệu**:
    *   **Bản phát hành**: Tên bản phát hành kèm ảnh bìa album (`ReleaseCoverImage`).
    *   **Nghệ sĩ**: Danh sách các nghệ sĩ đóng góp (ngăn cách bằng dấu phẩy).
    *   **Hãng đĩa**: Tên hãng đĩa quản lý.
    *   **Số bài hát**: Tổng số track nhạc trong bản phát hành.
    *   **Ngày phát hành**: Định dạng hiển thị `DD/MM/YYYY`.
*   **Phân trang**: Bảng hỗ trợ phân trang động với bộ chọn kích thước trang (Page Size Changer) và hiển thị tổng số bản ghi ở chân trang.
