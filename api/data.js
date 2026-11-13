/* Gia Phả Dòng Họ — shared state API qua Google Apps Script + Drive.
   Bản thay thế cho api/data.js (Blob), giữ NGUYÊN hợp đồng với index.html:
   GET  /api/data            -> {ok, exists, data?}
   POST /api/data {pin, data} -> ghi đè toàn bộ doc, chỉ khi pin khớp pin đang lưu
   POST /api/data {action:"declare", entry} -> thêm 1 khai báo (không cần PIN)
   Không polling: client chỉ đọc 1 lần khi mở trang, chỉ ghi khi Ban biên soạn lưu.
   Cần 2 biến môi trường trên project Vercel gia-pha-dong-ho-bui (Production):
     SHEETS_API_URL = URL Web app Apps Script dạng .../exec
     SHEETS_SECRET  = đúng chuỗi SECRET đã đặt trong Script Properties
   Lỗi được phân biệt rõ (không lộ secret hay URL đầy đủ trong response):
     env_missing        -> thiếu SHEETS_API_URL / SHEETS_SECRET
     script_http        -> Apps Script trả HTTP không ok (kèm status)
     script_forbidden   -> Apps Script trả {ok:false, error:"forbidden"} (sai SECRET)
     script_error       -> Apps Script trả JSON không ok khác (kèm script_error)
     script_fetch_failed -> lỗi fetch / parse JSON khi gọi Apps Script
   File chung nằm trên Drive của user (gia-pha-state.json, riêng tư), không phải
   repo GitHub public như bản github-sync, cũng không tốn Blob ops. */

const MAX_BYTES = 1500000;

function send(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.json(obj);
}

function scriptError(res, result) {
  const obj = { ok: false, error: result.error };
  if (result.status) obj.status = result.status;
  if (result.script_error) obj.script_error = result.script_error;
  return send(res, 503, obj);
}

async function callScript(method, payload) {
  const url = process.env.SHEETS_API_URL;
  const secret = process.env.SHEETS_SECRET;
  try {
    let r;
    if (method === "GET") {
      r = await fetch(url + "?key=" + encodeURIComponent(secret), {
        cache: "no-store",
      });
    } else {
      r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: secret, ...payload }),
      });
    }
    if (!r.ok) return { error: "script_http", status: r.status };
    let j;
    try {
      j = await r.json();
    } catch (e) {
      return { error: "script_fetch_failed" };
    }
    if (!j || typeof j !== "object") return { error: "script_fetch_failed" };
    if (j.ok) return { ok: true, json: j };
    if (j.error === "forbidden") return { error: "script_forbidden" };
    return {
      error: "script_error",
      script_error: typeof j.error === "string" ? j.error : "unknown",
    };
  } catch (e) {
    return { error: "script_fetch_failed" };
  }
}

export default async function handler(req, res) {
  const url = process.env.SHEETS_API_URL;
  const secret = process.env.SHEETS_SECRET;
  if (!url || !secret) {
    const which = !url && !secret ? "both" : !url ? "api_url" : "secret";
    return send(res, 503, { ok: false, error: "env_missing", which });
  }
  try {
    if (req.method === "GET") {
      const result = await callScript("GET");
      if (!result.ok) return scriptError(res, result);
      const j = result.json;
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
        const result = await callScript("POST", { action: "declare", entry });
        if (!result.ok) return scriptError(res, result);
        return send(res, 200, { ok: true, savedAt: result.json.savedAt });
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
      const result = await callScript("POST", { pin: body.pin, data });
      if (!result.ok) {
        if (
          result.error === "script_error" &&
          result.script_error === "wrong_pin"
        ) {
          return send(res, 403, { ok: false, error: "wrong_pin" });
        }
        return scriptError(res, result);
      }
      return send(res, 200, { ok: true, savedAt: result.json.savedAt });
    }

    return send(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    return send(res, 503, { ok: false, error: "script_fetch_failed" });
  }
}
