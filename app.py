
from flask import Flask, render_template, request, jsonify
from urllib.parse import urlparse
import os
import datetime

app = Flask(__name__)

download_count = 0

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/get_info", methods=["POST"])
def get_info():
    global download_count
    data = request.get_json()
    url = data.get("url")

    if not url:
        return jsonify({"error": "No URL provided"}), 400

    if not url.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
        return jsonify({"error": "Only direct video links allowed"}), 400

    filename = os.path.basename(urlparse(url).path)
    download_count += 1

    return jsonify({
        "title": filename,
        "thumbnail": "https://via.placeholder.com/800x400.png?text=Video+Preview",
        "download_url": url,
        "time": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_downloads": download_count
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=10000)
