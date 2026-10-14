
# Stage 1: Compile our TypeScript application
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies, including TypeScript
COPY package*.json ./
RUN npm ci

# Copy source code and compile it
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# Stage 2: Run the compiled application
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install only the dependencies needed at runtime
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JavaScript
COPY --from=build /app/dist ./dist

# Drizzle needs these migration files at startup
COPY --from=build /app/src/db/migrations ./src/db/migrations

EXPOSE 8080

CMD ["node", "dist/index.js"]
