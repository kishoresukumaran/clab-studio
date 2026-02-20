# Build stage
FROM node:20-alpine as build

# Set working directory
WORKDIR /app

# Build arguments for React environment variables
ARG REACT_APP_SERVER_IP
ARG REACT_APP_AUTH_API_URL
ARG REACT_APP_BACKEND_API_URL
ARG REACT_APP_CONTAINERLAB_API_URL
ARG REACT_APP_CLAB_SERVERS

# Set environment variables for the build
ENV REACT_APP_SERVER_IP=${REACT_APP_SERVER_IP}
ENV REACT_APP_AUTH_API_URL=${REACT_APP_AUTH_API_URL}
ENV REACT_APP_BACKEND_API_URL=${REACT_APP_BACKEND_API_URL}
ENV REACT_APP_CONTAINERLAB_API_URL=${REACT_APP_CONTAINERLAB_API_URL}
ENV REACT_APP_CLAB_SERVERS=${REACT_APP_CLAB_SERVERS}

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:stable-alpine

# Copy the build output from the build stage
COPY --from=build /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx server
CMD ["nginx", "-g", "daemon off;"] 