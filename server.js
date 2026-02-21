
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/get_info', (req, res) => {
    const url = req.body.url;

    if (!url) {
        return res.json({ error: "No URL provided" });
    }

    // Placeholder response (no real downloading logic)
    res.json({
        title: "Demo Video Title (Placeholder)",
        thumbnail: "https://via.placeholder.com/800x450.png?text=Video+Thumbnail",
        download_url: url
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
