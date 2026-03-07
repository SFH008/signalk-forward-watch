# signalk-forward-watch Roadmap

---

## v0.1.0 — Released
- Custom YOLOv8n marine model (21,719 training images, 100 epochs)
- 6 detection classes: ship, boat, debris, buoy, kayak, log
- ONVIF auto-discovery + manual RTSP
- Signal K notifications and `environment.forwardWatch.detections` path
- OpenCPN integration via fake AIS vessels
- Published on GitHub Releases

**Known issue in v0.1.0:** ONNX inference runs on the Signal K main event loop thread.
Inference takes ~2 minutes on Pi 4 CPU. At short intervals this blocks Signal K entirely
(GPS, AIS, engine data freeze). Workaround: raise `detection_interval` to 300s in plugin
config.

---

## v0.2.0 — Planned

### Goal
Move ONNX inference off the Signal K event loop so the server stays fully responsive
during detection, and restore detection to a useful frequency (60s).

### Changes

**Worker thread architecture**
- New `src/onnx-worker.js` — loads model once, runs inference in its own V8 thread
- Main plugin sends camera frame to worker via `postMessage`
- Worker posts detections back; plugin publishes to Signal K
- Signal K event loop never blocked regardless of inference time

**ONNX Runtime session tuning for Raspberry Pi**
```js
options.intraOpNumThreads = 1;
options.addConfigEntry("session.intra_op.allow_spinning", "0");
options.executionMode = 'sequential';
```
Prevents ONNX internal thread pool from busy-spinning between inferences —
significantly reduces idle CPU on edge devices.

**Detection interval**
- Default: 60s (was 300s workaround)
- Configurable in plugin settings UI
- Worker persists between cycles — no V8 respawn overhead per detection

**Worker lifecycle**
- Spawned in `plugin.start()`, terminated in `plugin.stop()`
- Worker crash: logged + auto-restart (does not crash Signal K)

**npm publish**
- Unblock npm account (sign-in broken as of v0.1.0)
- Publish `signalk-forward-watch@0.2.0`

### Expected results

| | v0.1.0 | v0.2.0 |
|--|--------|--------|
| Signal K blocked during inference | Yes (~2 min) | No |
| Detection frequency | 300s (workaround) | 60s |
| Pi CPU during inference | ~58% | ~25% |
| Idle CPU burn (ONNX spin-wait) | High | Low |

---

## v0.3.0 — Future ideas
- Model download on first run (no manual wget step)
- Retrain model with more debris / low-visibility samples
- Night mode detection (infrared camera support)
- Distance estimation from bounding box size
- Alert escalation: notify → alarm → autopilot waypoint injection
