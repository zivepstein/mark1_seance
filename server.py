#!/usr/bin/env python3
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

PORT = int(os.environ.get("PORT", "3000"))
MODEL = "black-forest-labs/flux-schnell"
ROOT = Path(__file__).resolve().parent
USER_AGENT = "seance-interface/1.0"

app = Flask(__name__)


def load_env_file():
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if "=" not in trimmed:
            continue
        key, _, value = trimmed.partition("=")
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


load_env_file()


def replicate_token():
    return os.environ.get("REPLICATE_API_TOKEN", "").strip()


def replicate_error(data, fallback, status=None):
    if status == 401:
        return (
            "Invalid Replicate API token. Create a new token at "
            "https://replicate.com/account/api-tokens, put it in .env as "
            "REPLICATE_API_TOKEN=r8_..., then restart the server."
        )
    if status == 403 and "1010" in str(data.get("detail", "")):
        return (
            "Replicate API blocked this request (Cloudflare 1010). "
            "Restart the server after updating — a User-Agent header is required."
        )
    if not data:
        return fallback
    detail = data.get("detail")
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        return "; ".join(item.get("msg", str(item)) for item in detail)
    return data.get("error") or fallback


def verify_replicate_token():
    """Return None if token looks valid, else an error message."""
    token = replicate_token()
    if not token:
        return "Missing REPLICATE_API_TOKEN in .env"
    if not token.startswith("r8_"):
        return "REPLICATE_API_TOKEN should start with r8_"
    status, data = replicate_request("GET", "/v1/models")
    if status == 401:
        return replicate_error(data, "Invalid Replicate API token.", status=401)
    if status >= 400:
        return replicate_error(data, f"Replicate API error ({status}).", status=status)
    return None


def replicate_request(method, api_path, body=None):
    token = replicate_token()
    payload = None
    headers = {
        "Authorization": f"Token {token}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Length"] = str(len(payload))

    req = urllib.request.Request(
        f"https://api.replicate.com{api_path}",
        data=payload,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read().decode("utf-8")
            status = res.status
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        status = err.code

    try:
        data = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        data = {"detail": raw}

    return status, data


def generate_image(prompt):
    status, prediction = replicate_request(
        "POST",
        "/v1/predictions",
        {"version": MODEL, "input": {"prompt": prompt}},
    )
    if status < 200 or status >= 300:
        raise RuntimeError(
            replicate_error(prediction, "Prediction request failed.", status=status)
        )

    terminal = {"succeeded", "failed", "canceled"}
    while prediction.get("status") not in terminal:
        time.sleep(1.5)
        status, prediction = replicate_request(
            "GET", f"/v1/predictions/{prediction['id']}"
        )
        if status < 200 or status >= 300:
            raise RuntimeError(
                replicate_error(prediction, "Polling prediction failed.", status=status)
            )

    if prediction.get("status") != "succeeded":
        raise RuntimeError(
            f"Generation ended with status: {prediction.get('status')}"
        )

    output = prediction.get("output")
    image_url = output[0] if isinstance(output, list) else output
    if not image_url:
        raise RuntimeError("No image URL returned from Replicate.")
    return image_url


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html")


@app.post("/api/generate")
def api_generate():
    if not replicate_token():
        return jsonify(
            {
                "error": (
                    "Missing REPLICATE_API_TOKEN. Add it to .env, "
                    "then restart the server."
                )
            }
        ), 500

    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "")).strip()
    if not prompt:
        return jsonify({"error": "Prompt is required."}), 400

    try:
        image_url = generate_image(prompt)
        return jsonify({"imageUrl": image_url})
    except Exception as err:
        return jsonify({"error": str(err)}), 500


if __name__ == "__main__":
    auth_error = verify_replicate_token()
    if auth_error:
        print(f"Warning: {auth_error}")
    else:
        print("Replicate API token OK.")
    print(f"Open http://localhost:{PORT}")
    app.run(host="127.0.0.1", port=PORT)
