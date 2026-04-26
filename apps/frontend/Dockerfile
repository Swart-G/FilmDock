FROM node:22-alpine

WORKDIR /app

COPY apps/frontend/package.json ./package.json
RUN npm install

COPY apps/frontend /app

RUN npm run build

EXPOSE 4173

CMD ["npm", "run", "preview"]

