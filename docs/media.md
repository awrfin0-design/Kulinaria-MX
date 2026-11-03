# Photos and videos

Everything lives in `assets/`. Merchant uploads (image pickers in the theme editor) always win over theme art.

## Photos (`photo-*.webp`)
`air-steak`, `air-steak-dark` (hero; `-m` = phone crops), `air-fish`, `air-bowl`, `air-romance`, `air-chef`, `air-breakfast`, `air-glass` (page headers), `hero`, `flames`, `dinner`, `containers`, `dish-0` … `dish-7`. Generated with AI for this proposal; replace by saving a file with the same name, or upload through the editor. Dish cards use each product's own photo in the live store (the `dish-N` files are only the sample catalogue).

## Videos (`video-*.mp4` + `-poster.webp`)
| File | Where | Notes |
|---|---|---|
| `video-hero-light.mp4`, `video-hero-dark.mp4` | Hero (one per theme) | AI, 5 s, 720p, **start frame = end frame** so it loops seamlessly; ingredients orbit and stream around the floating cut |
| `video-band.mp4` | Scroll band "El fuego hace la diferencia" | stock grill fire, **scrubbed by scrolling**; keyframe every 4 frames |
| `video-fire.mp4` | Inside every pill / circle-arrow button on hover | stock fire, cropped to embers/flames, blended with `screen` |
| `video-chef.mp4` | Carta and team showcases | stock chef slicing a tomato |
| `video-gold.mp4` | spare | stock abstract, hue-shifted to gold |

Rules: muted + `playsinline`, `preload="none"`, loaded only when visible, poster frame always, nothing plays under `prefers-reduced-motion` or Save-Data, pause button on the hero.

### Replacing a video
Keep the file name and re-export small: `ffmpeg -i in.mp4 -an -vf scale=1280:-2 -r 24 -c:v libx264 -crf 28 -preset slow -movflags +faststart out.mp4`. For the scrubbed band add `-g 4 -keyint_min 4 -sc_threshold 0`. For a new hero loop, generate it from the still with the same image as start and end frame.
