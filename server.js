const express = require("express");
const path = require("path");
const app = express();

let downloadCount = 0;

app.use(express.json());
app.use(express.static("public"));

app.post("/get_info", (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: "No URL provided" });
    }

    if (!url.match(/\.(mp4|webm|mov|mkv)$/i)) {
        return res.status(400).json({ error: "Only direct video links allowed" });
    }

    downloadCount++;

    const fileName = path.basename(url);

    res.json({
        title: fileName,
        thumbnail: "https://via.placeholder.com/800x400.png?text=Video+Preview",
        download_url: url,
        total_downloads: downloadCount,
        time: new Date().toLocaleString()
    });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
