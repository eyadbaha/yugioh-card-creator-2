ARG NODE_IMAGE=node:24-alpine3.23

FROM ${NODE_IMAGE} AS deps

WORKDIR /var/task
COPY package*.json ./
RUN npm ci

FROM deps AS development
COPY tsconfig.json nodemon.json ./
COPY src ./src
COPY assets ./assets
RUN npm run build
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM ${NODE_IMAGE} AS production
ENV NODE_ENV=production
WORKDIR /var/task
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY assets ./assets
COPY --from=build /var/task/build ./build
COPY index.mjs ./
USER node
CMD ["npm", "start"]
