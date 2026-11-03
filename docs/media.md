# Photos and videos

Everything lives in `assets/`. Merchant uploads (image pickers in the theme editor) always win over theme art.

## Photos (`photo-*.webp`)
`hero`, `wood` (site background), `flames`, `dinner`, `containers`, `dish-0` … `dish-7`. Generated with AI for this proposal; replace by saving a file with the same name, or upload through the editor. Dish cards use each product's own photo in the live store (the `dish-N` files are only the sample catalogue).

## Videos (`video-*.mp4` + `-poster.webp`)
| File | Where | Notes |
|---|---|---|
| `video-second.mp4` | Hero, video 1 | plating with sauce (AI) |
| `video-hero-2.mp4` | Hero, video 2 | stock clip (steak smoking on the grill), warmed to sepia |
| `video-band.mp4` | "El fuego hace la diferencia" band | stock grill fire, **scrubbed by scrolling**; exported with a keyframe every 4 frames |
| `video-fire.mp4` | Inside every button on hover | stock fire, cropped to embers/flames, blended with `screen` |
| `video-gold.mp4` | Shimmer over the CTA banner | stock abstract, hue-shifted to gold |
| `video-chef.mp4` | Carta showcase | stock chef slicing a tomato |

Rules the theme follows: muted + `playsinline`, `preload="none"` and loaded only near the viewport, poster frame always, nothing plays under `prefers-reduced-motion` or Save-Data, pause button on the hero.

### Replacing a video
Keep the same file name and re-export small: `ffmpeg -i in.mp4 -an -vf scale=1280:-2 -r 24 -c:v libx264 -crf 29 -preset slow -movflags +faststart out.mp4`. For the scrubbed band add `-g 4 -keyint_min 4 -sc_threshold 0`. Sections also take a video URL (hero, showcase) for hosting on Shopify Files / a CDN.
