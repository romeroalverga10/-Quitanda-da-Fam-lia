FROM node:18-alpine

WORKDIR /app

COPY package*.json .npmrc ./

RUN npm ci --omit=optional

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
