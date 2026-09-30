# TIẾP TỤC DỰ ÁN — Khoai Lang Thang Direct Playback

Cập nhật: 2026-09-30

## Mục tiêu
Giữ lại các bước đã chứng minh hoạt động để phiên sau tiếp tục đúng điểm, không quay lại các hướng đã thất bại. Phần dịch vụ nằm tại `youtube-khoai-service/`.

## Dữ liệu đã có
- Kênh YouTube Khoai Lang Thang: `@KhoaiLangThang`, channel ID `UCZE88kYvCKUKjM-G0uc8Duw`.
- Đã quét đúng 254 video (Videos, không lấy Shorts).
- Catalog: `youtube-khoai/catalog.json` và `youtube-khoai/catalog.csv`.
- Video test chính: `B1qT38bVsXc`.

## Các bước đã thành công

### 1. Lấy link media bằng SaveTube trên Render
Resolver hiện dùng quy trình SaveTube:
1. Lấy CDN SaveTube.
2. Gọi `/v2/info` bằng URL YouTube.
3. Giải mã dữ liệu AES-128-CBC.
4. Chọn quality.
5. Gọi `/download`.
6. Nhận URL media tạm thời của CDN SaveTube.
7. Render trả HTTP 302 để thiết bị phát trực tiếp từ CDN, không proxy toàn bộ video qua Render.
8. Cache URL tạm thời khoảng 90 phút và không lưu URL CDN cố định vào catalog.

Kiến trúc này đã chứng minh resolver hoạt động và tránh việc Render phải gánh toàn bộ băng thông video.

### 2. Nuvio đã phát được link resolver
Trong quá trình test, video `B1qT38bVsXc` đã phát mượt ở mức cố định 1080p. Sau đó 1440p/2K cũng resolve ổn định.

Điểm quan trọng: không dùng lại cơ chế “Auto Quality” giả dựa trên việc client request lại URL. Cơ chế đó từng tự hạ 2160 → 1440 → 1080 → 720 và làm timeline/giây phát nhảy. Đã bỏ hướng này.

Cách ổn định: chọn chất lượng trước khi phát và giữ nguyên file/URL trong phiên phát.

### 3. Endpoint direct quality đã LIVE
Endpoint:
`/play/:id/:quality.mp4`

Các mức hỗ trợ:
`2160, 1440, 1080, 720, 480, 360`.

Ví dụ:
`/play/B1qT38bVsXc/1440.mp4`

Quy trình:
player → Render resolver → SaveTube fresh URL → HTTP 302 → CDN.

Commit direct endpoint:
`6515e063504d5ee0c00c2dc998adea9d3e683530`.

### 4. Web player standalone đã deploy thành công
- `/player` đã được thêm.
- Commit: `56b454ca21a76293074c99287538be0669c515c6`.
- Deploy đầu bị kẹt ở `update_in_progress` dù build đã successful.
- Sau khi cancel 2 deploy bị kẹt và deploy sạch lại, deploy `dep-dau9ah893c1s73d9imf0` lên LIVE trong khoảng 26 giây.

### 5. Resolver vẫn hoạt động khi Safari player thất bại
Khi thử web HTML5 player trên iPhone Safari, 1440p, 1080p và 720p đều không phát.

Nhưng log Render xác nhận resolver thành công:
- 1440p → `cdn406.savetube.vip`
- 1080p → `cdn400.savetube.vip`
- 720p → `cdn406.savetube.vip`
- đều có `[DIRECT-PLAY]`.

Do đó lỗi web player xảy ra sau bước 302/CDN; không được kết luận resolver hỏng chỉ vì Safari HTML5 không phát.

## VLC — điểm cần tiếp tục kiểm chứng
Đường test hiện tại:
`https://khoai-nuvio-addon.onrender.com/play/B1qT38bVsXc/1440.mp4`

Mở bằng VLC → Open Network Stream.

Mục đích:
- Nếu VLC phát được: xác nhận direct resolver/CDN phù hợp với VLC và có thể dùng VLC hoặc player có khả năng tương thích tương tự làm nền tảng độc lập.
- Nếu VLC không phát: kiểm tra request/redirect/range/content-type/codec/container của CDN trước khi thay resolver.

Không được ghi “VLC đã phát thành công” cho đến khi có test thực tế xác nhận.

## Những hướng KHÔNG nên lặp lại
- yt-dlp trực tiếp trên Render: YouTube chặn bằng `Sign in to confirm you’re not a bot`.
- bgutil/PO-token trên Render: vẫn gặp bot check.
- Auto Quality giả dựa vào request lặp: gây đổi file giữa phiên và timeline nhảy.
- HTML5 Safari hiện tại: resolver trả URL thành công nhưng Safari không phát các mức đã thử.
- Không proxy nguyên video 2K/4K qua Render nếu chưa thật sự cần; mục tiêu là thiết bị stream trực tiếp CDN.

## Bằng chứng yt-dlp ngoài Render
Trên iPhone a-Shell, yt-dlp từng lấy được URL CDN YouTube thật cho video test, gồm video 2160p và audio riêng. Điều này chứng minh video nguồn có chất lượng cao, nhưng kiến trúc cuối không được phụ thuộc laptop hay resolver chạy cục bộ trên iPhone.

## Render hiện tại
Service: `khoai-nuvio-addon`
URL: `https://khoai-nuvio-addon.onrender.com`
Repo: `chuongnguyen89dn-ui/Toolchecklink`
Build: `cd youtube-khoai-service && npm install --omit=dev`
Start: `cd youtube-khoai-service && npm start`

## Việc tiếp theo
1. Test direct endpoint bằng VLC với video `B1qT38bVsXc`, ưu tiên 1440p.
2. Ngay sau test, xem log Render để xác nhận request, resolver và CDN.
3. Nếu VLC phát: giữ resolver hiện tại và xây nền tảng/player độc lập dựa trên kiểu playback tương thích.
4. Nếu VLC không phát: kiểm tra chính response cuối của CDN (redirect chain, Range, Content-Type, codec/container) rồi sửa theo bằng chứng.
5. Chỉ sau khi video test ổn định mới áp dụng cho toàn bộ 254 video.
