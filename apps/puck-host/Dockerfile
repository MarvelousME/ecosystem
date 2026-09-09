FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_BRIDGE_API_URL=http://localhost:4000
ENV VITE_BRIDGE_API_URL=$VITE_BRIDGE_API_URL
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/puck
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
