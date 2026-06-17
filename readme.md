# YGO Card Creator 2

HTTP service for rendering standard and Rush Duel card images from JSON input.

## Run Locally

Install dependencies, build, and start the server:

```sh
npm ci
npm run build
npm start
```

Use a custom style root:

```sh
STYLES_DIR=./my-styles npm start
```

Use multiple style roots:

```sh
STYLES_DIRS="./styles:./my-styles" npm start
```

On Windows, separate `STYLES_DIRS` entries with `;`.

## Docker

Mount a style root over the baked-in default styles:

```sh
docker run -p 8080:8080 -v ./my-styles:/var/task/styles image-name
```

The mounted directory should contain `general/fonts`, optional `general/font-masks`, and one or more style packs with `style.json`, `settings.json`, `icons`, and `template`.

## Style Packs

Each pack is self-describing with a `style.json` manifest:

```json
{
  "name": "Series 1",
  "section": "Duel Links (Speed)",
  "type": "standard"
}
```

`section` is the editor grouping, `name` is the series inside that section, and all styles in one section must share a `type`. See `styles/README.md` for the full layout and custom-pack walkthrough.

## Runtime Options

- `PORT`: server port, default `8080`.
- `STYLES_DIR`: style root, default `./styles`.
- `STYLES_DIRS`: path-list of style roots.
- `STYLES_WATCH=1`: reload style packs in development when JSON, PNG, or font files change.
- `WEBP_QUALITY`: output quality, default `94`.
- `WEBP_EFFORT`: encoder effort, default `4`.
