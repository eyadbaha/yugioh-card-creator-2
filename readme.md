# YGO Card Creator 2

HTTP service for rendering standard and Rush Duel card images from JSON input.

Deployed test endpoint:

```text
https://v26dqxritu6bbzmqmukd6gknrm0izedp.lambda-url.us-east-1.on.aws/
```

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

## Render API

Standard cards render from `POST /`. Rush Duel cards render from `POST /rush`.

Successful responses return an `image/webp` card image.

Example standard card request:

```json
{
  "name": "Decode Talker",
  "section": "Duel Links (Speed)",
  "style": "Series 1",
  "attribute": "DARK",
  "level": 3,
  "template": "link",
  "monsterType": "[Cyberse/Link/Effect]",
  "cardText": "2+ Effect Monsters\nGains 500 ATK for each monster it points to. When your opponent activates a card or effect that targets a card(s) you control (Quick Effect): You can Tribute 1 monster this card points to; negate the activation, and if you do, destroy that card.",
  "atk": "2300",
  "def": "0",
  "linkArrows": ["Top", "Bottom-Left", "Bottom-Right"],
  "icon": "cyberse",
  "pendulum": false,
  "art": "https://images.ygoprodeck.com/images/cards_cropped/1861629.jpg"
}
```

## Scripts

- `npm run build`: Transpiles TypeScript files to JavaScript.
- `npm run test`: Builds the application and runs the server.
- `npm run dev`: Starts the server with nodemon for development.
- `npm start`: Starts the server.

## Docker

Build and run the production image:

```sh
docker build -t ygo-card-creator-2 .
docker run -p 8080:8080 ygo-card-creator-2
```

Mount a style root over the baked-in default styles:

```sh
docker run -p 8080:8080 -v ./my-styles:/var/task/styles ygo-card-creator-2
```

The mounted directory should contain `general/fonts`, optional `general/font-masks`, and one or more style packs with `style.json`, `settings.json`, `icons`, and `template`.

For AWS Lambda container deployment, build the `prod-lambda` target.

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
