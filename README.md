# EduProof - Hệ Thống Nộp & Chấm Bài Tập Minh Chứng

Ứng dụng web chuyên biệt hỗ trợ học sinh nộp bài tập về nhà bằng hình ảnh chụp bài vở thực tế hoặc bằng chứng số (link, ghi chú). Giáo viên có thể chấm điểm, phê duyệt, vẽ bút đỏ trực tiếp lên ảnh bài làm và yêu cầu chụp lại. Dữ liệu được liên kết và đồng bộ trực tiếp qua **Supabase Cloud**.

---

## ✨ Tính năng chính

1. **Cổng Đăng Nhập Độc Lập**:
   - Tài khoản **Admin**: Quản lý danh sách giáo viên toàn trường và giám sát sĩ số học sinh.
   - Tài khoản **Giáo viên**: Tự tạo bài tập theo đợt, cấp tài khoản riêng cho học sinh lớp mình phụ trách, chấm bài và nhận xét trực tiếp.
   - Tài khoản **Học sinh**: Xem danh sách bài tập được giao, chụp ảnh vở nộp bài, xem kết quả điểm và lời phê của giáo viên.

2. **Chụp & Xử Lý Ảnh Thông Minh**:
   - Tự động nén ảnh phía client giữ nguyên độ nét chữ viết nhưng dung lượng cực nhẹ (< 400KB/ảnh).
   - Công cụ xoay ảnh (90° / 180°), phóng to thu nhỏ và crop chỉnh góc để bài nộp luôn rõ ràng.

3. **Studio Chấm Bài Trực Quan (Bút Đỏ Giáo Viên)**:
   - Giáo viên vẽ bút đỏ trực tiếp lên từng trang bài nộp của học sinh (khoanh tròn, gạch chân, dấu tích xanh/đỏ).
   - Chấm điểm số (0 - 10), nhận xét nhanh hoặc yêu cầu học sinh chụp nộp lại nếu ảnh mờ/thiếu trang.

4. **Đồng Bộ Đám Mây Supabase Cloud (Realtime)**:
   - Không còn phụ thuộc bộ nhớ máy cục bộ; dữ liệu được đồng bộ trực tiếp qua Supabase PostgreSQL.
   - Hỗ trợ Realtime: Khi giáo viên giao bài hoặc học sinh nộp bài, giao diện hai bên tự cập nhật ngay.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### Bước 1: Thiết lập cơ sở dữ liệu trên Supabase
1. Đăng nhập vào [Supabase Dashboard](https://supabase.com).
2. Vào mục **SQL Editor** và dán toàn bộ nội dung trong file `schema.sql`.
3. Bấm **Run** để khởi tạo các bảng:
   - `eduproof_users`
   - `eduproof_assignments`
   - `eduproof_submissions`

### Bước 2: Khởi động hệ thống
- **Cách 1**: Nhấp đúp chuột vào file `start.bat` để chạy server nội bộ và tự động mở trình duyệt tại `http://localhost:8080`.
- **Cách 2**: Mở trực tiếp file `index.html` trên trình duyệt web.

---

## 🔐 Tài Khoản Khởi Tạo Mẫu
- **Admin**: `admin` / Mật khẩu: `admin123`
- **Giáo viên chủ nhiệm 12A1**: `gvcn-ngo-ha` / Mật khẩu: `000000`
- *(Tài khoản học sinh do Giáo viên tạo trong bảng điều khiển và gửi thông tin cho học sinh).*

---

## 🧪 Kiểm Thử Hệ Thống
Chạy bộ kiểm thử tự động với Node.js:
```bash
node test_system.js
```
*(11/11 bài kiểm thử logic kinh doanh, phân quyền và đồng bộ Supabase Cloud đều đạt).*
