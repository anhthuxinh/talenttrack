# Theo dõi Chương trình Nhân viên Tài năng PVEP năm 2025–2026

Trang HTML tĩnh đọc và cập nhật dữ liệu chung trong Supabase. Không cần Next.js, npm, máy chủ riêng hoặc tải lại Excel sau mỗi lần sửa. Bản trên GitHub Pages chỉ chứa giao diện, Project URL và publishable key; dữ liệu nhân sự vẫn ở Supabase, được bảo vệ bằng đăng nhập và Row Level Security (RLS).

## Đưa trang lên GitHub Pages

Nội dung thư mục `github-ready/` là bộ tệp công khai. Trong repository GitHub, vào **Settings → Pages → Build and deployment → Deploy from a branch**, chọn **main** và **/(root)**. Địa chỉ dự kiến: `https://anhthuxinh.github.io/talenttrack/`.

Trong **Supabase Dashboard → Authentication → URL Configuration**, thêm `https://anhthuxinh.github.io/talenttrack/` vào **Redirect URLs** và đặt **Site URL** cùng địa chỉ. Bật đăng nhập email. Hai người được phép xem/sửa theo RLS là `thuta@pvep.com.vn` và `trinhhv@pvep.com.vn`. Mở trang, nhập một trong hai email và bấm liên kết đăng nhập được gửi qua email. Nếu email công ty không nhận được thư, kiểm tra cấu hình email/SMTP của Supabase hoặc dùng phương thức đăng nhập khác; hiện giao diện mới hỗ trợ liên kết email.

Trang tải dữ liệu mới nhất khi mở hoặc bấm **Làm mới**. Các nút lưu nội dung, đánh giá MĐHTCV và lịch hướng dẫn ghi vào các bảng Supabase. Việc xóa nội dung/chủ đề trên trang đang ẩn vì chính sách cơ sở dữ liệu hiện chỉ cấp quyền thêm và sửa. Có thể quản lý việc xóa trong Supabase Table Editor sau khi xác nhận dữ liệu cần xóa.

## Dữ liệu và cách tính

- Sáu bảng: `talent_targets`, `talent_employees`, `talent_activities`, `talent_assessments`, `talent_mentoring_topics`, `talent_mentoring_sessions`.
- Tiến độ tổng là bình quân của bốn nhóm mục tiêu: giảng dạy, chuyên môn, sáng kiến, tiếng Anh. Quản lý/kỹ năng được theo dõi riêng.
- Đánh giá MĐHTCV chỉ hiện trong hồ sơ cá nhân. Xếp loại điểm bình quân: đến 79,49 là HT; trên 79,49 đến 89,49 là HTT; trên 89,49 là HTXS.
- Buổi hướng dẫn có ngày đã qua được xem là đã thực hiện theo giờ Bangkok.

## Lưu ý nguồn dữ liệu

File Excel SharePoint ban đầu đã được chuyển thành sáu bảng Supabase. Sửa Excel sau đó **không tự đồng bộ** sang Supabase; sửa trên web ghi vào Supabase, **không ghi ngược** vào Excel. Nút **Sao lưu dữ liệu** tải JSON, không phải Excel.

Không đưa `seed.js`, `private-data.json`, file Excel, CSV nhập liệu hoặc bản sao JSON lên repository công khai. Chạy `node scripts/build-public.mjs` từ thư mục dự án để tạo lại bộ `github-ready/` chỉ gồm tệp an toàn.
