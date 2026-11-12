import { head, put } from "@vercel/blob";

/* Gia Phả Dòng Họ — shared state API (1 file JSON duy nhất).
   GET  /api/data            -> {ok, exists, data?}  (doc gia-pha/state.json)
   POST /api/data {pin, data} -> ghi đè toàn bộ doc, chỉ khi pin khớp pin đang lưu
   POST /api/data {action:"declare", entry} -> thêm 1 khai báo (không cần PIN)
   Ops: GET ~2 (head + content fetch), POST ~3 (head + content + put).
   Không polling: client chỉ đọc 1 lần khi mở trang, chỉ ghi khi Ban biên soạn lưu.
   Nếu BLOB_READ_WRITE_TOKEN thiếu (store chưa nối / đang bị suspend) -> 503
   blob_unavailable, client vẫn chạy bằng localStorage. */

const PATH = "gia-pha/state.json";
const MAX_BYTES = 1500000; // ~1.5 MB: đủ cho hàng trăm thành viên; ảnh base64 lớn nên nén trước

function send(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.json(obj);
}

function noBlob(res) {
  return send(res, 503, {
    ok: false,
    error: "blob_unavailable",
    message:
      "Blob storage is not connected or is suspended (quota). Shared sync is unavailable; the page keeps working with browser-local storage.",
  });
}

async function readDoc() {
  try {
    const h = await head(PATH);
    if (!h) return null;
    const r = await fetch(h.downloadUrl || h.url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null; // BlobNotFoundError etc. -> chưa có bản chung
  }
}

function emptyDoc() {
  return {
    app: "gia-pha-dong-ho",
    version: 2,
    savedAt: new Date().toISOString(),
    pin: "1234",
    clan: { name: "", village: "", chief: "", message: "", church: "", announce: "" },
    members: [],
    chapters: [],
    prayers: [],
    funds: [],
    photos: [],
    declarations: [],
  };
}

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return noBlob(res);
  try {
    if (req.method === "GET") {
      const doc = await readDoc();
      if (!doc) return send(res, 200, { ok: true, exists: false });
      return send(res, 200, { ok: true, exists: true, data: doc });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      // Khai báo của con cháu: ai cũng gửi được, không cần PIN; Ban biên soạn duyệt sau.
      if (body.action === "declare") {
        const entry = body.entry || {};
        if (!entry.name || typeof entry.name !== "string") {
          return send(res, 400, { ok: false, error: "bad_entry" });
        }
        const doc = (await readDoc()) || emptyDoc();
        doc.declarations = Array.isArray(doc.declarations) ? doc.declarations : [];
        doc.declarations.push(entry);
        doc.savedAt = new Date().toISOString();
        await put(PATH, JSON.stringify(doc), {
          access: "public",
          allowOverwrite: true,
          addRandomSuffix: false,
          contentType: "application/json",
          cacheControlMaxAge: 0,
        });
        return send(res, 200, { ok: true, savedAt: doc.savedAt });
      }

      // Ghi toàn bộ: chỉ người nhập đúng PIN Ban biên soạn mới được ghi.
      const data = body.data || {};
      if (data.app !== "gia-pha-dong-ho") {
        return send(res, 400, { ok: false, error: "bad_data" });
      }
      const raw = JSON.stringify(data);
      if (raw.length > MAX_BYTES) {
        return send(res, 413, {
          ok: false,
          error: "too_large",
          message: "Data over 1.5 MB (photos too large). Remove some photos and retry.",
        });
      }
      const current = await readDoc();
      if (current && String(body.pin || "") !== String(current.pin || "")) {
        return send(res, 403, { ok: false, error: "wrong_pin" });
      }
      data.savedAt = new Date().toISOString();
      await put(PATH, JSON.stringify(data), {
        access: "public",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      });
      return send(res, 200, { ok: true, savedAt: data.savedAt });
    }

    return send(res, 405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    const msg = String((e && e.message) || e || "");
    if (/suspend|quota|403|forbidden/i.test(msg)) return noBlob(res);
    return send(res, 500, { ok: false, error: "server_error", message: msg.slice(0, 200) });
  }
}
