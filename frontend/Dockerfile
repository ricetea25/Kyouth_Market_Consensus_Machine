FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./

# DEV TARGET
FROM base AS dev
RUN npm install
COPY . .
# Start Next.js in development mode
CMD ["npm", "run", "dev"]

# PROD TARGET (Optional for later)
FROM base AS prod
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
