FROM node:16-alpine as development

WORKDIR /var/task
COPY package*.json /var/task
RUN npm install
COPY . . 
RUN npm run build
CMD [ "npm","run","dev"]

FROM node:16-alpine as production
WORKDIR /var/task
COPY package*.json /var/task
RUN npm install --production
COPY --from=development var/task/build ./build
COPY . .
CMD [ "npm","start" ]