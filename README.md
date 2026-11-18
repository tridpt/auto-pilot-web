# 🤖 AutoPilot Web — Điều Khiển Trình Duyệt Tự Động, Cào Dữ Liệu & Điền Form Hàng Loạt

Công cụ tự động hóa trình duyệt Chrome/Edge trực tiếp qua giao thức **DevTools Protocol (CDP)**, chạy 100% trên nhân Node.js chuẩn mà không cần cài thêm thư viện ngoài.

## 🚀 Cách chạy nhanh

Chạy trực tiếp file **[start.bat](file:///d:/AI_App/auto-pilot-web/start.bat)** (tự động mở trình duyệt tại `http://localhost:4095`):

```bat
start.bat
```

Hoặc chạy bằng dòng lệnh:

```powershell
node server.js
```

## 🔥 Các Tính Năng Trọng Tâm

1. **🤖 Thiết Kế & Chạy Kịch Bản Tự Động (`Workflow Builder`)**
   - Xây dựng chuỗi bước: Mở URL (`goto`), Click nút (`click`), Nhập văn bản (`type`), Cuộn trang (`scroll`), Chờ (`wait`), Cào danh sách dữ liệu (`extract_list`), Chụp ảnh màn hình (`screenshot`).
   - Hỗ trợ chuyển đổi giữa **👻 Chạy ngầm siêu tốc (Headless)**, **🖥️ Hiện cửa sổ Chrome/Edge thật trên màn hình**, và **🔐 Giữ Phiên Đăng Nhập & Cookie (`user-data-dir`)**.
   - Xem ảnh chụp màn hình trình duyệt trực tiếp sau từng bước và xuất bảng dữ liệu ra **Excel (CSV chuẩn tiếng Việt UTF-8)** hoặc **JSON**.

2. **🎬 Tự Động Ghi Thao Tác Chuột & Bàn Phím Trên Trình Duyệt (`Live Action Recorder`)**
   - Nhập URL và bấm **🔴 Mở Trình Duyệt & Ghi Thao Tác** (hoặc **⚡ Chạy Thử Ghi Tự Động Demo**): hệ thống tiêm bộ lắng nghe DOM vào trình duyệt để tự động bắt mọi cú click và phím gõ của bạn, tự sinh CSS Selector chuẩn xác và biến thành kịch bản hoàn chỉnh.

3. **🔍 Dò Tự Động Ô Nhập & Nút Bấm + 🔗 Đồng Bộ Cookie & JWT Sang NetPulse**
   - Quét toàn bộ biểu mẫu trên trang đích để tự sinh kịch bản điền form chỉ với 1 click.
   - Bấm **🔗 Đồng bộ Cookie & Token sang NetPulse** để trích xuất toàn bộ `HttpOnly Cookies` + `Bearer/JWT Token` từ trình duyệt và nạp thẳng vào Kho Biến Môi Trường (`{{COOKIE_HEADER}}`, `{{API_TOKEN}}`) của **NetPulse (`http://localhost:4080`)**.

4. **🧲 Cào Dữ Liệu Trang Web 1-Click (`Smart Scraper`)**
   - Nhập bất kỳ URL nào → Tự động mở trình duyệt, cuộn trang tải dữ liệu động, chụp ảnh màn hình và trích xuất:
     - Danh sách Sản phẩm / Thẻ / Bảng biểu
     - Toàn bộ Đường dẫn (`Links`) và Hình ảnh (`Images`)
     - Hoặc cào theo bộ chọn **CSS Selector tùy chỉnh**.

5. **📝 Điền Form Hàng Loạt (`Bulk Form Loop`)**
   - Nhập trực tiếp bảng **CSV / Excel** hoặc mảng **JSON** nhiều khách hàng / đơn hàng / bản ghi.
   - Tự động lặp qua từng dòng, điền vào biểu mẫu bằng biến `{{ten_cot}}`, bấm nút Gửi và thu thập mã xác nhận cho từng dòng.

6. **⏰ Hẹn Giờ Chạy Ngầm & Giám Sát Thay Đổi Trang Web (`Website Change Monitor & Alerting`)**
   - Đặt lịch chạy kịch bản định kỳ mỗi N phút hoặc bấm **▶️ Chạy & Kiểm tra ngay**.
   - Tự động băm SHA-256 dữ liệu cào được (`lastSnapshotHash`) để phát hiện **khi nào giá sản phẩm / nội dung trang web thay đổi (`changed` vs `unchanged`)** và bắn cảnh báo tức thời về **Telegram / Discord / NetPulse Webhook**.

7. **🛒 Trang Sandbox Nội Bộ (`/sandbox/shop`)**
   - Đi kèm một trang thương mại điện tử & biểu mẫu đặt hàng mẫu ngay tại `http://localhost:4095/sandbox/shop` để bạn test mọi chức năng chỉ với 1 cú click.
