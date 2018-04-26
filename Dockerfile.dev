FROM node:8.1

ENV APP_DIR=/usr/src/app

RUN npm install -g nodemon yarn

RUN mkdir -p $APP_DIR

COPY package.json yarn.lock /usr/src/
WORKDIR /usr/src
RUN yarn install

ENV NODE_PATH=/usr/src/node_modules
ENV PATH="$PATH:/usr/src/node_modules/.bin"
WORKDIR $APP_DIR

CMD [ "nodemon", "--exec", "yarn", "run", "start" ]
