ARG NODE_IMAGE=node:24-alpine3.23
ARG RUNTIME_IMAGE=alpine:3.23
ARG LAMBDA_IMAGE=public.ecr.aws/lambda/nodejs:24

FROM ${NODE_IMAGE} AS deps

WORKDIR /var/task
COPY package*.json ./
RUN npm ci

FROM deps AS development
COPY tsconfig.json nodemon.json ./
COPY src ./src
COPY styles ./styles
RUN npm run build
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY styles ./styles
RUN npm run build

FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /var/task
COPY package*.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && rm -rf node_modules/@img/sharp-linux-* node_modules/@img/sharp-libvips-linux-*

FROM ${RUNTIME_IMAGE} AS production
ENV NODE_ENV=production
RUN apk add --no-cache nodejs libstdc++ \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node
WORKDIR /var/task
COPY --from=prod-deps --chown=node:node /var/task/node_modules ./node_modules
COPY --chown=node:node package.json index.mjs ./
COPY --chown=node:node styles ./styles
COPY --from=build --chown=node:node /var/task/build ./build
USER node
CMD ["node", "build/server.js"]

FROM ${LAMBDA_IMAGE} AS prod-lambda
ENV NODE_ENV=production
WORKDIR ${LAMBDA_TASK_ROOT}
COPY package*.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force
COPY index.mjs ./
COPY styles ./styles
COPY --from=build /var/task/build ./build
CMD ["index.handler"]
