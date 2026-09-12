# Self-hosted fonts

Served from this directory rather than a CDN. Iranian networks reach foreign
CDNs unreliably, and a blocked stylesheet would silently drop every menu to the
Tahoma fallback — a visible downgrade on the one screen a restaurant's customers
actually see. Self-hosting also removes a third-party runtime dependency in a
sanctions environment.

All four families are licensed under the SIL Open Font License 1.1.

| File                       | Family    | Source                                     |
| -------------------------- | --------- | ------------------------------------------ |
| `Vazirmatn-Variable.woff2` | Vazirmatn | github.com/rastikerdar/vazirmatn           |
| `Estedad-Variable.woff2`   | Estedad   | github.com/aminabedi68/Estedad (v8.5)      |
| `Sahel-Variable.woff2`     | Sahel     | github.com/rastikerdar/sahel-font (v3.4.0) |
| `Samim-Regular.woff2`      | Samim     | github.com/rastikerdar/samim-font (v4.0.5) |
| `Samim-Bold.woff2`         | Samim     | github.com/rastikerdar/samim-font (v4.0.5) |

Vazirmatn, Estedad and Sahel ship a single variable file covering the whole
weight range. Samim has no variable build, so it ships the two weights the
templates actually use.

Only Vazirmatn is preloaded (see `src/app/layout.tsx`). The others are declared
with `@font-face` but a browser downloads a face only when something on the page
actually uses it, so a venue on Vazirmatn pays nothing for the other three.
