# Build from the repo root:  docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ARG VITE_SOCKET_URL
ARG VITE_RAZORPAY_KEY_ID
ENV VITE_API_URL=$VITE_API_URL VITE_SOCKET_URL=$VITE_SOCKET_URL VITE_RAZORPAY_KEY_ID=$VITE_RAZORPAY_KEY_ID
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/web --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
