# signalk-forward-watch

AI-powered forward watch obstacle detection for Signal K. Monitors a bow-mounted IP camera using a custom-trained YOLOv8 marine model and sends detections into the Signal K data stream as notifications and values.

**Detects:** ships, boats, debris, buoys, kayaks, logs

---

## Requirements

- Signal K server (Node.js ≥ 18)
- A bow-mounted IP camera with RTSP stream (ONVIF cameras auto-discovered)
- ffmpeg installed on the host (`sudo apt install ffmpeg`)
- Raspberry Pi 4 or better (CPU inference, no GPU required)

---

## Installation

**Step 1 — Install the plugin**
```bash
cd ~/.signalk
npm install signalk-forward-watch
```

**Step 2 — Download the detection model**

The YOLOv8 marine model is hosted on GitHub Releases (12MB — too large to bundle in the npm package).

```bash
mkdir -p ~/.signalk/node_modules/signalk-forward-watch/models
wget -O ~/.signalk/node_modules/signalk-forward-watch/models/forward-watch.onnx \
  https://github.com/SkipperDon/signalk-forward-watch/releases/download/v0.1.0/forward-watch.onnx
```

Or download it manually from the [Releases page](https://github.com/SkipperDon/signalk-forward-watch/releases) and place it at:
```
~/.signalk/node_modules/signalk-forward-watch/models/forward-watch.onnx
```

**Step 3 — Enable the plugin**

Restart Signal K and enable the plugin in **Admin → Plugin Config → Forward Watch**.

---

## Configuration Fields

| Field | Default | Description |
|-------|---------|-------------|
| **Camera IP Address** | — | IP address of your bow camera (e.g. `192.168.1.100`) |
| **Camera Username** | `admin` | RTSP/ONVIF login username |
| **Camera Password** | — | RTSP/ONVIF login password |
| **RTSP URL** | auto | Full RTSP stream URL. If left blank, the plugin runs ONVIF discovery using the IP/user/pass above. Enter manually to skip discovery: `rtsp://user:pass@ip:554/stream1` |
| **Detection interval (seconds)** | `30` | How often to grab a frame and run detection. Lower = more CPU. 30s is recommended for Raspberry Pi 4. |
| **Alert cooldown (seconds)** | `30` | Minimum time between repeat alerts for the same target type and quadrant. Prevents alarm flooding. |
| **Enable audio alarm** | `false` | Plays a system beep on detection within 100m. Requires audio output on the host. |
| **Confidence threshold** | `0.4` | Minimum detection confidence (0–1). Lower = more detections but more false positives. 0.4 is a good starting point. |

---

## Signal K Data

### `environment.forwardWatch.detections`

Updated every detection interval. Always present — empty array `[]` when nothing detected.

**Example value (nothing detected):**
```json
[]
```

**Example value (boat detected):**
```json
[
  {
    "class_id": 1,
    "class_name": "boat",
    "confidence": 0.72,
    "cx": 0.51,
    "cy": 0.63,
    "w": 0.18,
    "h": 0.24,
    "position": {
      "latitude": 43.1234,
      "longitude": -70.5678
    },
    "distance": 45,
    "bearing": 187,
    "quadrant": "starboard"
  }
]
```

**Detection object fields:**

| Field | Type | Description |
|-------|------|-------------|
| `class_name` | string | Detected object type: `ship`, `boat`, `debris`, `buoy`, `kayak`, `log` |
| `class_id` | number | Numeric class index (0–5) |
| `confidence` | number | Model confidence 0–1 (e.g. `0.72` = 72% confident) |
| `cx` | number | Bounding box centre X, fraction of image width (0 = left, 1 = right) |
| `cy` | number | Bounding box centre Y, fraction of image height (0 = top, 1 = bottom) |
| `w` | number | Bounding box width as fraction of image width |
| `h` | number | Bounding box height as fraction of image height |
| `distance` | number | Estimated distance in metres (monocular estimate — larger object in frame = closer) |
| `bearing` | number | Estimated bearing in degrees true |
| `quadrant` | string | `port` (left half of frame) or `starboard` (right half of frame) |
| `position.latitude` | number | Estimated GPS latitude of the object (requires boat GPS in Signal K) |
| `position.longitude` | number | Estimated GPS longitude of the object (requires boat GPS in Signal K) |

> **Note on distance accuracy:** Distance is estimated from bounding box height using a monocular depth formula. It assumes a ~60° horizontal field of view. Accuracy is ±50% — treat it as a rough range indicator, not a precise measurement. A proper rangefinder integration would improve this.

---

### `notifications.forwardWatch.<class_name>`

A Signal K notification is sent for any detection **within 100m**. One notification path per class. Respects the alert cooldown setting.

**Severity levels:**

| Distance | Severity | Meaning |
|----------|----------|---------|
| ≤ 30m | `emergency` | Imminent collision risk |
| ≤ 75m | `warn` | Close approach — take action |
| > 75m | `normal` | Awareness only |

**Example notification:**
```json
{
  "state": "alert",
  "severity": "warn",
  "message": "boat detected 45m ahead at bearing 187",
  "timestamp": "2026-03-06T13:02:42.484Z"
}
```

---

## Detection Classes

| Class | Description |
|-------|-------------|
| `ship` | Large commercial vessel |
| `boat` | Recreational or small vessel |
| `debris` | Floating debris, garbage |
| `buoy` | Navigation buoy |
| `kayak` | Kayak or small paddle craft |
| `log` | Floating log or deadhead |

---

## Model

- Architecture: YOLOv8n (nano) — optimised for edge CPU deployment
- Training: 21,719 labelled marine images, 100 epochs
- Input: 640×640 RGB
- Format: ONNX (CPU inference via onnxruntime-node)
- File: `models/forward-watch.onnx` (~12MB)

---

## Performance

| Hardware | Inference time | Recommended interval |
|----------|---------------|----------------------|
| Raspberry Pi 4 (4GB) | ~1.6s | 30s |
| Raspberry Pi 5 | ~0.6s (estimated) | 10s |
| x86 CPU (modern) | ~0.3s | 5s |

---

## Troubleshooting

**No detections, camera not connecting**
- Check your RTSP URL is correct. Test it with VLC on another device.
- Make sure ffmpeg is installed: `ffmpeg -version`
- Check the camera IP is reachable from the Signal K host.

**High CPU usage**
- Increase the detection interval. 30s is recommended for Pi 4.
- The plugin guards against overlapping inference cycles — if one cycle takes longer than the interval, the next is skipped.

**Distance estimates seem wrong**
- This is expected. Monocular depth estimation from a single camera is inherently imprecise. Use as a rough guide only.
- Accuracy improves for larger objects that fill more of the frame.

**No GPS position in detections**
- The plugin reads `navigation.position` and `navigation.headingTrue` from Signal K.
- If your GPS isn't providing position data, detections will still appear but without `position`, `distance`, and `bearing` fields.

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

**Author:** SkipperDon
**Plugin ID:** `signalk-forward-watch`
**npm:** [signalk-forward-watch](https://www.npmjs.com/package/signalk-forward-watch)
