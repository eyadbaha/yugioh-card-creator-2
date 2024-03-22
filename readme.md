
# Yugioh Card Generator

## Description

Yugioh Card Generator is a Node.js package designed to generate Yu-Gi-Oh! card images based on provided JSON data. It utilizes the information in the JSON object to create a corresponding card image. This package includes functionalities for handling API requests and generating card images dynamically.

You can find a deployed version to test here: https://v26dqxritu6bbzmqmukd6gknrm0izedp.lambda-url.us-east-1.on.aws/

## Installation

To install, clone the repository and navigate to the project directory. Then, execute the following command in your terminal:

```bash
npm install
```

## Usage

### API Call Example

To generate a Yu-Gi-Oh! card image, make an API call with JSON data specifying the card details. Here's an example JSON object:

```json
POST https://v26dqxritu6bbzmqmukd6gknrm0izedp.lambda-url.us-east-1.on.aws/
{
  "name": "Decode Talker",
  "style": "duel_links",
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

This will generate a Yu-Gi-Oh! card image corresponding to the specified parameters.

## Scripts

- `npm run build`: Transpiles TypeScript files to JavaScript.
- `npm run test`: Builds the application and runs the server.
- `npm run dev`: Starts the server with nodemon for development.
- `npm start`: Starts the server.

## Dockerfile

The Dockerfile included in this package provides configurations for both development and production environments.

### Development Stage

```Dockerfile
FROM node:16-alpine as development

WORKDIR /var/task
COPY package*.json /var/task
RUN npm install
COPY . . 
RUN npm run build
CMD [ "npm","run","dev"]
```

### Production Stage

```Dockerfile
FROM node:16-alpine as production
WORKDIR /var/task
COPY package*.json /var/task
RUN npm install --production
COPY --from=development var/task/build ./build
COPY . .
CMD [ "npm","start" ]
```

## AWS Lambda Index File

For serverless deployment using AWS Lambda, an index file is provided.

```javascript
import serverlessExpress from "@vendia/serverless-express";
import { app } from "./build/app.js";

export const handler = serverlessExpress({ app });
```
