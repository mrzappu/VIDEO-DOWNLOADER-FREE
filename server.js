import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sanitize from "sanitize-filename";

const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const JOB_ROOT = process.env.JOB_ROOT || path.join(process.cwd(), "jobs_tmp");
fs.mkdirSync(JOB_ROOT, { recursive: true });

const jobs = new Map();

// Prevent server crash on unexpected async errors (Render will otherwise return 503)
process.on("unhandledRejection", (reason) => {
  console.error("UnhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UncaughtException:", err);
});

// Optional YouTube auth cookies (do NOT commit cookies to GitHub)
// Set env var YTDLP_COOKIES_B64 on Render to a base64-encoded cookies.txt content.
const COOKIES_PATH = path.join(process.cwd(), "cookies.txt");
try {
  const b64 = process.env.YTDLP_COOKIES_B64;
  if (b64 && !fs.existsSync(COOKIES_PATH)) {
    fs.writeFileSync(COOKIES_PATH, Buffer.from(b64, "base64"));
    console.log("cookies.txt written from YTDLP_COOKIES_B64");
  }
} catch (e) {
  console.error("Failed to write cookies.txt:", e);
}

function ytDlpCookieArgs() {
  // If cookies.txt exists, pass it to yt-dlp
  try {
    if (fs.existsSync(COOKIES_PATH) && fs.statSync(COOKIES_PATH).size > 0) {
      return ["--cookies", COOKIES_PATH];
    }
  } catch {}
  return [];
}

function baseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http").toString();
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

function htmlEscape(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function runYtDlpJson(url, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const args = ["-J", "--no-warnings", "--skip-download", ...ytDlpCookieArgs(), ...extraArgs, url];
    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    // IMPORTANT: if yt-dlp is missing, Node emits 'error' and will crash if we don't handle it
    p.on("error", (e) => {
      reject(new Error(`yt-dlp not available: ${e?.message || e}`));
    });
    p.on("close", (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("yt-dlp JSON parse error"));
        }
      } else {
        reject(new Error((err || "yt-dlp failed").slice(0, 2000)));
      }
    });
  });
}

function startJob({ id, url, title, ext }) {
  const jobDir = path.join(JOB_ROOT, id);
  fs.mkdirSync(jobDir, { recursive: true });

  const safeTitle = sanitize(title || "video").slice(0, 120) || "video";
  const outBase = path.join(jobDir, safeTitle);

  const job = {
    status: "processing",
    type: "download_start",
    percent: "0%",
    filePath: "",
    fileName: "",
    createdAt: Date.now(),
    error: ""
  };
  jobs.set(id, job);

  let args;
  if (ext === "mp3") {
    job.type = "downloading";
    args = [
      url,
      "--no-playlist",
      ...ytDlpCookieArgs(),
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      `${outBase}.%(ext)s`
    ];
  } else {
    job.type = "downloading";
    args = [
      url,
      "--no-playlist",
      ...ytDlpCookieArgs(),
      "-f",
      "bestvideo+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "-o",
      `${outBase}.%(ext)s`
    ];
  }

  const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

  const onLine = (line) => {
    const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (m) {
      job.type = "downloading";
      job.percent = `${Math.floor(Number(m[1]))}%`;
    }
    if (line.includes("[ExtractAudio]")) {
      job.type = "converting";
      job.percent = "0%";
    }
    if (line.includes("[Merger]")) {
      job.type = "merging";
      job.percent = "0%";
    }
  };

  p.stdout.on("data", (d) => d.toString().split(/\r?\n/).forEach(onLine));
  p.stderr.on("data", (d) => d.toString().split(/\r?\n/).forEach(onLine));

  // IMPORTANT: handle spawn error to avoid server crash (missing yt-dlp/ffmpeg)
  p.on("error", (e) => {
    job.status = "error";
    job.error = `yt-dlp not available: ${e?.message || e}`;
  });

  p.on("close", (code) => {
    if (code !== 0) {
      job.status = "error";
      job.error = "yt-dlp failed";
      return;
    }

    const files = fs.readdirSync(jobDir).filter((f) => !f.endsWith(".part"));
    const wantedExt = ext === "mp3" ? ".mp3" : ".mp4";
    const found = files.find((f) => f.toLowerCase().endsWith(wantedExt)) || files[0];
    if (!found) {
      job.status = "error";
      job.error = "output not found";
      return;
    }

    job.status = "success";
    job.type = "success";
    job.percent = "100%";
    job.fileName = found;
    job.filePath = path.join(jobDir, found);
  });
}

app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/healthz", async (req, res) => {
  // Simple diagnostics to confirm yt-dlp exists (useful on Render)
  try {
    const p = spawn("yt-dlp", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", (e) => {
      res.status(200).json({ ok: false, error: `yt-dlp not available: ${e?.message || e}` });
    });
    p.on("close", (code) => {
      res.status(200).json({
        ok: true,
        yt_dlp_version: out.trim(),
        code,
        cookies_enabled: ytDlpCookieArgs().length > 0
      });
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/mates/en/analyze/ajax", async (req, res) => {
  try {
    const url = (req.body?.url || "").toString().trim();
    if (!url) {
      return res.json({ status: "unavailable", result: "<div class='alert alert-danger'>Empty URL</div>" });
    }

    let info;
    try {
      info = await runYtDlpJson(url);
    } catch (e1) {
      // Fallback for YouTube breakages: try android client
      info = await runYtDlpJson(url, ["--extractor-args", "youtube:player_client=android"]);
    }
    const title = info?.title || "Video";
    const id = crypto.randomBytes(8).toString("hex");

    const safeTitle = htmlEscape(title);
    const safeUrl = htmlEscape(url);

    const html =
      `<div class="alert alert-success mb-3"><b>${safeTitle}</b></div>` +
      `<div class="d-flex gap-2 flex-wrap">` +
      `<button class="btn btn-primary" onclick="download('${safeUrl}','${safeTitle}','${id}','mp4',0,'mp4-best','best','','',count)">MP4 (Best)</button>` +
      `<button class="btn btn-outline-primary" onclick="download('${safeUrl}','${safeTitle}','${id}','mp3',0,'mp3-320k','bestaudio','','',count)">MP3 (320k)</button>` +
      `</div>`;

    return res.json({ status: "success", result: html });
  } catch (e) {
    return res.json({
      status: "unavailable",
      result:
        "<div class='alert alert-danger text-center'>Service is wrong, Please try again later</div>" +
        "<div class='small text-muted text-center mt-2'>Backend error: " +
        htmlEscape(String(e?.message || e)).slice(0, 300) +
        "</div>"
    });
  }
});

app.post("/mates/en/convert", (req, res) => {
  const id = (req.query?.id || "").toString();
  const url = (req.body?.url || "").toString().trim();
  const title = (req.body?.title || "").toString();
  const ext = (req.body?.ext || "mp4").toString();

  if (!id || !url) return res.json({ status: "unsupported_url" });
  if (!jobs.has(id)) startJob({ id, url, title, ext });
  return res.json({ status: "processing" });
});

app.post("/mates/en/convert/status", (req, res) => {
  const id = (req.query?.id || "").toString();
  const job = jobs.get(id);
  if (!job) return res.json({ status: "processing", type: "analyse_start", percent: "0%" });

  if (job.status === "success") {
    return res.json({
      status: "success",
      downloadUrlX: `${baseUrl(req)}/downloads/${encodeURIComponent(id)}`
    });
  }
  if (job.status === "error") return res.json({ status: "not_response" });
  return res.json({ status: "processing", type: job.type, percent: job.percent });
});

app.get("/downloads/:id", (req, res) => {
  const id = req.params.id;
  const job = jobs.get(id);
  if (!job || job.status !== "success" || !job.filePath) return res.status(404).send("Not ready");

  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(job.fileName)}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  fs.createReadStream(job.filePath).pipe(res);
});

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > 30 * 60 * 1000) {
      try { fs.rmSync(path.join(JOB_ROOT, id), { recursive: true, force: true }); } catch {}
      jobs.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
