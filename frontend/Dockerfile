FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* /app/
RUN npm ci

COPY . /app

EXPOSE 3000

# Next dev 要綁 0.0.0.0，不然容器外連不到
CMD ["npm", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000"]