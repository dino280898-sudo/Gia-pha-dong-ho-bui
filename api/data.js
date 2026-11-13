/* Gia Phả Dòng Họ — shared state API qua Google Apps Script + Drive.
   Bản thay thế cho api/data.js (Blob), giữ NGUYÊN hợp đồng với index.html:
   GET  /api/data            -> {ok, exists, data?}
   POST /api/data {pin, data} -> ghi đè toàn bộ doc, chỉ khi pin khớp pin đang lưu
   POST /api/data {action:"declare", entry} -> thêm 1 khai báo (không cần PIN)
   Không polling: client chỉ đọc 1 lần khi mở trang, chỉ ghi khi Ban biên soạn lưu.
   Cần 2 biến môi trường trên project Vercel gia-pha-dong-ho-bui (Production):
     SHEETS_API_URL = URL Web app Apps Script dạng .../exec
     SHEETS_SECRET  = đúng chuỗi SECRET đã đặt trong Script Properties
   Thiếu 1 trong 2 -> 503 sheets_unavailable, trang vẫn chạy bằng localStorage.
   File chung nằm trên Drive của user (gia-pha-state.json, riêng tư), không phải
   repo GitHub public như bản github-sync, cũng không tốn Blob ops. */

const MAX_BYTES = 1500000;

function send(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.json(obj);
}

function noSheets(res) {
  return send(res, 503, {
    ok: false,
    error: "sheets_unavailable",
    message:
      "Google Apps Script storage is not configured or unavailable. Shared sync is unavailable; the page keeps working with browser-local storage.",
  });
}

async function callScript(method, payload) {
  const url = process.env.SHEETS_API_URL;
  const secret = process.env.SHEETS_SECRET;
  if (!url || !secret) return null;
  if (method === "GET") {
    const r = await fetch(url + "?key=" + encodeURIComponent(secret), {
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.json();
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: secret, ...payload }),
  });
  if (!r.ok) return null;
  return await r.json();
}

export default async function handler(req, res) {
  if (!process.env.SHEETS_API_URL || !process.env.SHEETS_SECRET) {
    return noSheets(res);
  }
  try {
    if (req.method === "GET") {
      const j = await callScript("GET");
      if (!j || !j.ok) return noSheets(res);
      if (!j.exists) return send(res, 200, { ok: true, exists: false });
      return send(res, 200, { ok: true, exists: true, data: j.data });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string"
          ? JSON.parse(req.body || "{}")
          : req.body || {};

      if (body.action === "declare") {
        const entry = body.entry || {};
        if (!entry.name || typeof entry.name !== "string") {
          return send(res, 400, { ok: false, error: "bad_entry" });
        }
        const j = await callScript("POST", { action: "declare", entry });
        if (!j || !j.ok) return noSheets(res);
        return send(res, 200, { ok: true, savedAt: j.savedAt });
      }

      const data = body.data || {};
      if (data.app !== "gia-pha-dong-ho") {
        return send(res, 400, { ok: false, error: "bad_data" });
      }
      if (JSON.stringify(data).length > MAX_BYTES) {
        return send(res, 413, {
          ok: false,
          error: "too_large",
          message: "Data over 1.5 MB (photos too large). Remove some photos and retry.",
        });
      }
      const j = await callScript("POST", { pin: body.pin, data });
      if (!j || !j.ok) {
        if (j && j.error === "wrong_pin") {
          return send(res, 403, { ok: false, error: "wrong_pin" });
        }
        return noSheets(res);
      }
      return send(res, 200, { ok: true, savedAt: j.savedAt });
    }

    return send(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    return noSheets(res);
  }
}
