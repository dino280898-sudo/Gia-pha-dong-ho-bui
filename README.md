# Gia Phả Dòng Họ — bản Vercel (lưu chung cho cả họ)

Ngày soạn: 2026-11-12 · Nguồn giao diện: artifact web_static `gia-pha-dong-ho` v3
(export `workspace/your_files/gia-pha-dong-ho/gia-pha-dong-ho.html`), giữ nguyên
toàn bộ bố cục, nhãn, form, sơ đồ cây 7 mục. Chỉ thêm lớp đồng bộ chung.

## Cách lưu chung hoạt động

- **Một bản ghi chung duy nhất:** `gia-pha/state.json` trong Vercel Blob.
  Nội dung đúng 1 JSON như bản artifact vẫn lưu localStorage:
  `{pin, clan, members, chapters, prayers, funds, photos, declarations}`.
- **Đọc:** client `GET /api/data` 1 lần khi mở trang. Nếu bản chung mới hơn
  bản trên máy này (so `savedAt`) thì tải về thay thế, rồi lưu local. Nếu
  bản trên máy này mới hơn (từng sửa lúc Blob sập), sau khi mở khóa PIN thì
  tự đẩy bản local lên làm bản chung.
- **Ghi:** Ban biên soạn lưu → `saveData()` vẫn lưu localStorage ngay, rồi
  debounce 1,5 giây `POST /api/data {pin, data}`. Server đọc bản chung hiện tại,
  chỉ ghi đè khi PIN gửi lên khớp PIN đang lưu; sai PIN → 403 `wrong_pin`.
- **Khai báo:** con cháu gửi khai báo không cần PIN —
  `POST /api/data {action:"declare", entry}`; server thêm vào `declarations[]`,
  Ban biên soạn duyệt vào cây như cũ.
- **Không polling, không heartbeat.** Trạng thái đồng bộ hiện ngay trong dòng
  "Đã lưu tự động…" ở đầu Ban biên soạn và mục 7.
- **Ảnh:** ảnh trưng bày lưu base64 trong JSON chung. Giới hạn server 1,5 MB
  cho toàn bộ doc — đủ cho hàng trăm thành viên + ảnh nhỏ; ảnh lớn nên nén
  trước khi tải lên, nếu vượt thì API trả 413 và trang báo rõ.
- **PIN không phải bí mật tuyệt đối:** PIN nằm trong doc chung và client cần nó
  để mở khóa; ai đọc được API/JS đều thấy được. Nó chỉ chặn sửa vô tình,
  giống đúng thiết kế PIN của trang gốc.

## Chi phí ops (Hobby 10.000 simple ops/tháng, tính theo tài khoản)

| Hành động | Ops |
|---|---|
| Mở trang 1 lần (GET: head + fetch nội dung) | ~2 |
| 1 lần lưu ở Ban biên soạn (head + fetch + put) | ~3 |
| 1 khai báo con cháu gửi | ~3 |
| Chờ/xem, không làm gì | 0 (không polling) |

Với mức dùng của một dòng họ (vài chục lượt mở/ngày, vài lần sửa/tuần),
một tháng chỉ tốn vài trăm ops — vừa trong quota Hobby, **khi quota còn**.

## ⚠️ TRẠNG THÁI NGÀY 12/11/2026 — CHƯA DEPLOY ĐƯỢC, 2 ĐIỂM KẸT

### Kẹt 1 — Vercel MCP bị 403 ở scope team (chặn cả deploy)
- Tài khoản: dino280898@gmail.com, gói Hobby, team mặc định
  `team_jHpurVxtR7LRUSVWydao0gNW`.
- `list_projects`, `get_project` (co-caro-dinoo, xoa-no-ho), `create_deployment`
  (cả khi truyền rõ `teamId`) đều trả 403:
  `Not authorized: Trying to access resource under scope "a-e78b". You must
  re-authenticate to this scope or use a token with access to this scope.`
  RequestId mẫu: `iad1:sfo1:iad1:sfo1::mnm69-1794454491310-3e9c4e8838de`
  (POST /v13/deployments), `...::t2ls5-1794454505895-5c886d53bc7e` (có teamId).
- Hướng dẫn trong lỗi yêu cầu gọi `authorize_team_access` và đưa user link
  phê duyệt — **nhưng tool này KHÔNG có trong danh sách tool của MCP server
  Vercel** (đã kiểm `list-tools`: chỉ có `list_teams`/`get_team`/
  `list_team_members`, không có authorize nào). Không tự đoán team, không yêu
  cầu user reconnect lại toàn bộ.
- **Cách mở khóa (cần user bấm 1 lần):** cấp lại quyền truy cập team cho
  kết nối Vercel (authorize team access / SSO cho team
  `team_jHpurVxtR7LRUSVWydao0gNW`, scope `a-e78b`) rồi chạy lại deploy bên
  dưới. Sau khi quyền mở, deploy chỉ là 1 lệnh, không cần sửa code.

### Kẹt 2 — Blob store `co-caro-rooms` đang SUSPENDED (quota Hobby)
- Quota 10.000 simple ops/tháng tính theo **tài khoản**, không theo store.
  Store cũ bị suspend sau vụ polling Cờ Caro, dự kiến mở lại ~22–23/11/2026
  (ngày chính xác chỉ có ở Dashboard → Usage/Billing).
- **Không tạo store Blob mới để lách:** store mới vẫn dùng chung quota tài
  khoản đã cạn, và tốn 1 Advanced Operation trên 2.000/tháng của Hobby.
- Vì vậy, ngay cả khi deploy được, `api/data.js` sẽ trả 503
  `blob_unavailable` cho tới khi store được mở lại (hoặc lên Pro).
  Client đã xử lý sẵn trường hợp này: trang vẫn chạy bình thường bằng
  localStorage + Xuất/Nhập JSON, dòng trạng thái báo rõ "chưa đồng bộ chung
  được". Không mất dữ liệu đã nhập trên máy.
- Kiểm tra store không thực hiện được qua MCP (cùng lỗi 403 scope team ở
  `get_storage_stores_by_id`); cần xem trực tiếp trên Vercel Dashboard →
  Storage → `co-caro-rooms` và Usage/Billing để biết ngày mở lại chính xác.

## Phương án thay thế (nếu không chờ Blob)
1. **Chờ Blob mở lại ~22–23/11** (miễn phí, không làm gì thêm): deploy bản
   này ngay khi quyền team mở, đồng bộ tự bật khi store mở lại.
2. **Lên Pro $20/tháng:** mở store ngay + 100.000 ops/tháng. Chỉ làm khi user
   phê duyệt chi phí — chưa mua gì.
3. **Giữ bản Vercel tĩnh + gắn JSON cố định:** deploy chỉ `index.html`, user
   điền xong Xuất JSON gửi lại, gắn JSON vào trang rồi deploy lại — mọi máy
   thấy cùng bản, nhưng mỗi lần sửa phải deploy lại. Không cần Blob.
4. **KV/Edge Config:** MCP hiện không có tool tạo KV/Edge Config mới (chỉ
   patch Edge Config đã có, cần ID), nên không khả thi nếu không có sẵn.

## Deploy (chạy khi Kẹt 1 đã mở)
Dùng Vercel MCP `create_deployment`, `requestBody`:
- `name`: `gia-pha-dong-ho`, `target`: `production`
- `files` (inline, encoding `utf-8`): `index.html`, `package.json`,
  `vercel.json`, `api/data.js` trong thư mục này.
Sau đó nối Blob store vào project (Dashboard → Storage → Connect, hoặc
`create_storage_stores_blob` — chỉ khi quota đã mở lại) để có env
`BLOB_READ_WRITE_TOKEN` cho function. Kiểm tra `get_deployment` tới khi
`READY`, lấy URL production `https://gia-pha-dong-ho.vercel.app`.

## Kiểm chứng sau deploy (chưa làm được vì chưa deploy)
1. Mở URL production ở trình duyệt 1: vào Ban biên soạn, PIN `1234`, sửa tên
   Trưởng tộc thành 1 giá trị thử, đợi dòng "Đã đồng bộ chung: đã lưu".
2. Mở URL ở trình duyệt khách thứ 2 (phiên/máy khác): tải lại trang, xác nhận
   thấy tên Trưởng tộc mới mà không cần nhập gì.
3. Thử sai PIN: sửa ở máy 2 khi chưa mở khóa → không ghi được.
4. Desktop + mobile 390px, không lỗi console; kiểm tra Usage sau 1 ngày xem
   ops có đúng ước tính (~2/lượt mở, ~3/lần lưu) không.
