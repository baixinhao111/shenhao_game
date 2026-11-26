"""Generate one image with Seedream 5.5 via OpenRouter.

usage: OPENROUTER_API_KEY=sk-or-... python3 scripts/assets/gen_image.py OUT.png ASPECT "prompt" [model]
  ASPECT: 1:1 | 2:3 | 16:9 | ...   model default: bytedance-seed/seedream-5-5
See docs/DEV_GUIDE.md §5 for the house prompt styles.
"""
import base64, json, os, sys, urllib.request, time

out, aspect, prompt = sys.argv[1], sys.argv[2], sys.argv[3]
model = sys.argv[4] if len(sys.argv) > 4 else "bytedance-seed/seedream-5-5"
body = {
    "model": model,
    "messages": [{"role": "user", "content": prompt}],
    "modalities": ["image"],
    "image_config": {"aspect_ratio": aspect},
}
req = urllib.request.Request(
    "https://openrouter.ai/api/v1/chat/completions",
    data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ.get("OPENROUTER_API_KEY", "sk-or-dummy")},
)
for attempt in range(3):
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            d = json.load(r)
        break
    except Exception as e:
        msg = getattr(e, "read", lambda: b"")()
        print("ERR", attempt, e, msg[:500], file=sys.stderr)
        time.sleep(5)
else:
    sys.exit(1)
msg = d["choices"][0]["message"]
imgs = msg.get("images") or []
if not imgs:
    print("NO IMAGE", json.dumps(d)[:800], file=sys.stderr)
    sys.exit(1)
url = imgs[0]["image_url"]["url"]
if url.startswith("data:"):
    data = base64.b64decode(url.split(",", 1)[1])
else:
    data = urllib.request.urlopen(url, timeout=120).read()
open(out, "wb").write(data)
print("OK", out, len(data))
