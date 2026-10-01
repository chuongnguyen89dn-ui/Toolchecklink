# TIEP TUC DU AN — YouTube Add-on / Toolchecklink

## Cập nhật từ phiên làm việc này

### 1. Mục tiêu
- Không sửa IvyPlay trong phạm vi công việc này.
- Công việc của repo `chuongnguyen89dn-ui/Toolchecklink` là cung cấp dữ liệu + resolver cho add-on YouTube để Ivy có thể nhận và phát.
- Khi người dùng nói “quét kênh” thì phải hiểu là đưa **video thực tế vào catalog có thể mở/phát**, không phải chỉ lưu metadata.

### 2. Kênh HOA BAN FOOD
- URL: https://www.youtube.com/@HOABANFOOD
- Channel ID đã xác định: `UCBhgBmuPFbLLxnejr09lnAQ`
- Uploads playlist tương ứng: `UUBhgBmuPFbLLxnejr09lnAQ`
- Yêu cầu: lấy nội dung từ tab **Videos**, KHÔNG lấy Shorts.
- Lần quét production trực tiếp từ `/@HOABANFOOD/videos` trả **872 video**.
- Catalog add-on riêng: `hoa-ban-food`.
- Không trộn với catalog Khoai.

### 3. Khoai Lang Thang
- Catalog Khoai hiện có 254 video và phải giữ nguyên.
- Không được phá catalog/resolver đang hoạt động khi thêm channel mới.
- Channel resolver trước đó của Khoai dùng channelId `UCZE88kYvCKUKjM-G0uc8Duw`, handle `@khoailangthang`.

### 4. Kiến trúc add-on hiện tại
- Repo/service: `Toolchecklink/youtube-khoai-service/`
- `server.js` đã được cập nhật để có catalog HOA BAN FOOD riêng.
- Khi service chạy, loader quét URL:
  `https://www.youtube.com/@HOABANFOOD/videos`
- Loader dùng danh sách playlist/video thực tế, loại trùng, tạo ID dạng `hoaban_<videoId>`.
- Endpoint catalog HOA BAN FOOD:
  - `/catalog/movie/hoa-ban-food.json`
  - `/catalog/movie/hoa-ban-food/:extra.json`
- Endpoint refresh:
  - `/hoaban/refresh`
- Meta:
  - `/meta/movie/<hoaban_videoId>.json`
- Stream:
  - `/stream/movie/<hoaban_videoId>.json`
- Manifest đã khai báo catalog `hoa-ban-food` và prefix `hoaban_`.

### 5. Playback / resolver
- Hiện đường phát production của Khoai và HOA BAN FOOD vẫn dùng resolver AUTO hiện có, không tự ý thay bằng SocialPlug nếu chưa kiểm chứng playback ổn định.
- SocialPlug đã được nghiên cứu/test riêng.
- Capture thực tế cho thấy SocialPlug `/api/convert` trả metadata và nhiều mức MP4, gồm 360p/480p/720p/1080p/1440p/2160p cho video test; response HTTP 200.
- Tuy nhiên việc SocialPlug trả được URL không đồng nghĩa Ivy playback đã ổn định. Trước đó đã gặp lỗi/range 404 khi thử đưa SocialPlug DASH vào đường phát chính, nên chưa được coi là production resolver mặc định.
- Mục tiêu chất lượng về sau: AUTO như YouTube và có khả năng lên 4K khi nguồn thực tế có 4K; không được đánh đồng “có 2160p trong response” với “Ivy đã phát được 4K”.

### 6. Deploy / trạng thái đã xác nhận
- Bản có HOA BAN FOOD đã được commit/deploy production.
- Commit đã thực hiện: `17abed703f5cb2100579c8f222558e588d714db2`
- Render deploy đã được xác nhận LIVE.
- Production log đã xác nhận:
  `[HOABAN-SCAN] done videos=872`
- Vì người dùng không lấy Shorts, 872 video từ tab Videos là tập dữ liệu cần dùng hiện tại.
- Không coi các số thống kê bên ngoài (959/962/963...) là số video long-form phải đạt; các nguồn đó có thể tính các loại nội dung khác nhau.

### 7. Quy tắc tiếp tục dự án
- Sau mỗi thay đổi code/build/deploy phải kiểm tra deploy status và runtime logs thực tế.
- Không nói “xong”, “LIVE”, “đã chạy” nếu chưa kiểm tra.
- Khi có lỗi: xác định nguyên nhân → sửa → redeploy → kiểm tra lại.
- Không làm các thay đổi nhỏ lắt nhắt nếu có thể hoàn thành một pass đầy đủ.
- Không sửa IvyPlay cho nhiệm vụ này trừ khi người dùng yêu cầu riêng.
- Không lấy Shorts cho HOA BAN FOOD.
- Không làm mất/ghi đè catalog 254 video Khoai.
- Khi user yêu cầu “quét toàn bộ”, phải đưa nội dung thực tế vào catalog có khả năng phát, không chỉ tạo metadata.
- Mọi cập nhật mới của phiên hiện tại phải nối tiếp từ file này, tránh ghi đè hoặc lặp lại lịch sử cũ.
