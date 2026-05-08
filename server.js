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

function isYoutubeUrl(u) {
  return /(^|\.)youtube\.com|youtu\.be/i.test(String(u || ""));
}

// Optional YouTube auth cookies (do NOT commit cookies to GitHub)
// Set env var YTDLP_COOKIES_B64 on Render to a base64-encoded cookies.txt content.
const COOKIES_PATH = path.join(process.cwd(), "cookies.txt");
try {
  const b64 = (process.env.YTDLP_COOKIES_B64 || "").replace(/\s+/g, "");
  if (b64 && !fs.existsSync(COOKIES_PATH)) {
    fs.writeFileSync(COOKIES_PATH, Buffer.from(b64, "base64"));
    console.log("cookies.txt written from YTDLP_COOKIES_B64");
  }
} catch (e) {
  console.error("Failed to write cookies.txt:", e);
}

function ytDlpCookieArgs(url) {
  // Only use cookies for YouTube (but YouTube is disabled in this project).
  // Keeping this conditional prevents sending Google cookies to other sites.
  if (!isYoutubeUrl(url)) return [];
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
    const args = [
      "-J",
      "--no-warnings",
      "--skip-download",
      "--no-check-certificate",
      "--geo-bypass",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      ...ytDlpCookieArgs(url),
      ...extraArgs,
      url
    ];

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

function startJob({ id, url, title, ext, format }) {
  const jobDir = path.join(JOB_ROOT, id);
  fs.mkdirSync(jobDir, { recursive: true });

  const safeTitle = sanitize(title || "video").slice(0, 120) || "video";
  const outBase = path.join(jobDir, safeTitle);

  const job = {
    status: "processing",
    type: "download_start",
    percent: "0%",
    format: format,
    filePath: "",
    fileName: "",
    createdAt: Date.now(),
    error: ""
  };
  console.log(`[JOB_START] id=${id} format=${format} title=${title}`);
  jobs.set(id, job);


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

  const finishSuccess = () => {
    const files = fs.readdirSync(jobDir).filter((f) => !f.endsWith(".part"));
    const wantedExt = ext === "mp3" ? ".mp3" : "." + String(ext || "mp4").toLowerCase();
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
  };

  const runAttempt = (args, next) => {
    job.type = "downloading";
    job.percent = "0%";

    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    console.log(`[EXEC] yt-dlp ${args.join(" ")}`);
    let stderr = "";

    p.stdout.on("data", (d) => d.toString().split(/\r?\n/).forEach(onLine));
    p.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      s.split(/\r?\n/).forEach(onLine);
    });

    // IMPORTANT: handle spawn error to avoid server crash (missing yt-dlp/ffmpeg)
    p.on("error", (e) => {
      job.status = "error";
      job.error = `yt-dlp not available: ${e?.message || e}`;
    });

    p.on("close", (code) => {
      if (code === 0) {
        finishSuccess();
        return;
      }
      // Try fallback if format not available, otherwise fail
      if (typeof next === "function") {
        next(stderr);
        return;
      }
      job.status = "error";
      job.error = (stderr || "yt-dlp failed").slice(0, 300);
    });
  };

  if (ext === "mp3") {
    const args = [
      url,
      "--no-playlist",
      "--no-check-certificate",
      "--geo-bypass",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      ...ytDlpCookieArgs(url),
      "-x",

      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      "-o",
      `${outBase}.%(ext)s`
    ];
    runAttempt(args);
    return;
  }

  // Handle Images
  if (["jpg", "png", "webp"].includes(ext)) {
    const args = [
      url,
      "--no-playlist",
      "--no-check-certificate",
      "--geo-bypass",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      ...ytDlpCookieArgs(url),
      "-f",
      format || "best",
      "-o",
      `${outBase}.%(ext)s`
    ];
    runAttempt(args);
    return;
  }

  // Reverting to the original high-quality logic that produced larger file sizes
  let selected = (format && String(format).trim()) ? String(format).trim() : "bestvideo+bestaudio/best";
  if (selected === "best") selected = "bestvideo+bestaudio/best";

  const outExt = String(ext || "mp4").toLowerCase();
  const attempt = [
    url,
    "--no-playlist",
    "--no-check-certificate",
    "--geo-bypass",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    ...ytDlpCookieArgs(url),
    "-f", selected,
    "--merge-output-format", outExt,
    "-o", `${outBase}.%(ext)s`
  ];
  
  console.log(`[EXEC] yt-dlp ${selected} -> ${outExt}`);
  runAttempt(attempt);
}






app.use(express.static(process.cwd()));

app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"));
});

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
        cookies_enabled: ytDlpCookieArgs("https://youtube.com").length > 0
      });
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
});

app.post("/mates/en/feedback", async (req, res) => {
  const { name, email, details } = req.body;
  const webhookUrl = "https://discord.com/api/webhooks/1502030592428998819/QfOlcqIz9eVvpf8BxMBJ4CVkyDYQwS-8x35sBS3fCEJJ92b-i6DZ2gBTMM3GfDSevgBl";


  if (!name || !details) return res.json({ status: "error", message: "Name and details are required." });

  try {
    const embed = {
      title: "📩 New Feedback Received",
      color: 0x6366f1, // Indigo
      fields: [
        { name: "👤 Name", value: name, inline: true },
        { name: "📧 Email", value: email || "Not provided", inline: true },
        { name: "📝 Message", value: details }
      ],
      footer: { text: "IMPOSTER Feedback System" },
      timestamp: new Date().toISOString()
    };

    let response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        username: "IMPOSTER Feedback",
        embeds: [embed] 
      })
    });

    // Fallback to simple text if embed fails
    if (!response.ok) {
        console.warn("Embed failed, trying simple text fallback...");
        response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                content: `📩 **New Feedback**\n**From:** ${name}\n**Email:** ${email || "N/A"}\n**Message:** ${details}`
            })
        });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Discord Final Failure:", response.status, errorText);
      throw new Error(`Discord API error: ${response.status}`);
    }

    res.json({ status: "success", message: "Feedback sent! Thank you." });
  } catch (error) {
    console.error("Webhook Execution Error:", error.message);
    res.json({ status: "error", message: "Service busy. Please try again in a few minutes." });
  }
});



app.post("/mates/en/analyze/ajax", async (req, res) => {

  try {
    const url = (req.body?.url || "").toString().trim();
    if (!url) {
      return res.json({ status: "unavailable", result: "<div class='alert alert-danger'>Empty URL</div>" });
    }

    // YouTube support enabled (removed restriction)
    
    let info;
    info = await runYtDlpJson(url);

    // If it's a playlist/reel with entries, take first item
    if (info && Array.isArray(info.entries) && info.entries.length) {
      info = info.entries[0];
    }

    const title = info?.title || "Video";
    const id = crypto.randomBytes(8).toString("hex");
    const thumbnail = info?.thumbnail || "";

    const formats = Array.isArray(info?.formats) ? info.formats : [];
    let videoFormats = formats
      .filter((f) => f && (f.vcodec && f.vcodec !== "none" || f.ext === "mp4" || f.ext === "mkv" || f.ext === "jpg" || f.ext === "png" || f.ext === "webp" || f.ext === "webm"))
      .map((f) => {
        const isImage = ["jpg", "png", "webp"].includes(f.ext);
        const hasVideo = f.vcodec && f.vcodec !== "none";
        const hasAudio = f.acodec && f.acodec !== "none";
        
        // Only append bestaudio if it's a video-only format and not an image
        const selector = (hasVideo && !hasAudio && !isImage) ? `${f.format_id}+bestaudio/best` : f.format_id;

        
        return {
          format_id: selector,
          ext: f.ext,
          height: f.height || 0,
          acodec: f.acodec,
          vcodec: f.vcodec,
          hasAudio: hasAudio,
          filesize: f.filesize || f.filesize_approx || 0,
          resolution: f.resolution || (f.height ? `${f.height}p` : (f.width ? `${f.width}x${f.height}` : "Source")),
          note: f.format_note || ""
        };
      })
      .filter((f) => f.format_id && f.ext)
      .sort((a, b) => (b.height - a.height) || (b.filesize - a.filesize))
      .slice(0, 50);

    // If no formats found but there is a direct URL (common for images)
    if (videoFormats.length === 0 && info?.url) {
        videoFormats.push({
            format_id: "best",
            ext: info.ext || "mp4",
            height: info.height || 0,
            resolution: "Original Quality",
            filesize: info.filesize || 0
        });
    }


    return res.json({ 
      status: "success", 
      data: {
        id,
        title,
        thumbnail,
        url,
        formats: videoFormats
      }
    });

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
  const format = (req.body?.format || "").toString();

  console.log(`[CONVERT] id=${id} ext=${ext} format=${format} url=${url.slice(0, 50)}...`);

  if (!id || !url) return res.json({ status: "unsupported_url" });
  if (!jobs.has(id)) startJob({ id, url, title, ext, format });
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
