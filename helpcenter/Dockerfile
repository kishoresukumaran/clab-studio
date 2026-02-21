# Multi-stage build for clab-studio help center documentation
# Stage 1: Build the documentation
FROM python:3.11-slim as builder

ARG SERVER_IP

WORKDIR /docs

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all documentation source files
COPY mkdocs.yml .
COPY docs/ ./docs/

# Substitute server IP in mkdocs.yml
RUN sed -i "s/SERVER_IP_PLACEHOLDER/${SERVER_IP}/g" mkdocs.yml

# Build the static site
RUN mkdocs build --site-dir site

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy the built site from builder stage
COPY --from=builder /docs/site /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
