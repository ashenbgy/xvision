# Xvision

Live camera x-ray vision: skull, brain, muscles, eyes and hand bones tracked onto your face and hands in the browser.
Everything runs locally; video is never uploaded.

## Run

No build step. Serve the folder (camera access needs `localhost` or https) and open it in Chrome or Edge:

    python3 -m http.server 8000     # then open http://localhost:8000

Open `http://localhost:8000/#demo` for a camera-free test scene.

## Layout

| Path | Purpose |
|------|---------|
| `index.html`, `css/style.css` | UI |
| `js/main.js` → `app.js` | entry, camera start-up |
| `js/scene.js`, `shaders.js` | three.js scene, materials, layers, reveal cuts |
| `js/head.js`, `hands.js` | pose smoothing + fit; hand bone rig |
| `js/tracking.js` | MediaPipe face/hand trackers, live loop |
| `js/render.js`, `labels.js`, `ui.js`, `demo.js` | per-frame draw, labels, controls, demo |
| `data/anatomy.bin`, `meta.json` | quantized meshes + labels/landmarks |

Needs internet on first load for three.js and MediaPipe (jsDelivr) and the tracker models (Google storage).

## Credits

Anatomy: BodyParts3D © The Database Center for Life Science, CC BY-SA 2.1 Japan. Models simplified and re-aligned.
Not a medical tool.
