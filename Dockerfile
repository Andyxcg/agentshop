FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=4242
EXPOSE 4242
CMD ["node", "server.js"]
