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

function runYtDlpJson(url) {
  return new Promise((resolve, reject) => {
    const args = ["-J", "--no-warnings", "--skip-download", url];
    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch {
          reject(new Error("yt-dlp JSON parse error"));
        }
      } else {
        reject(new Error(err || "yt-dlp failed"));
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

app.post("/mates/en/analyze/ajax", async (req, res) => {
  try {
    const url = (req.body?.url || "").toString().trim();
    if (!url) {
      return res.json({ status: "unavailable", result: "<div class='alert alert-danger'>Empty URL</div>" });
    }

    const info = await runYtDlpJson(url);
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
  } catch {
    return res.json({
      status: "unavailable",
      result: "<div class='alert alert-danger text-center'>Service is wrong, Please try again later</div>"
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

