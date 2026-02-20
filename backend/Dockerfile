FROM node:18

# Install dependencies for containerlab
RUN apt-get update && apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    openssh-client \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install containerlab
RUN bash -c "$(curl -sL https://get.containerlab.dev)" -- -v 0.68.0

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Create the required directory structure and set permissions
RUN mkdir -p /home/clab_nfs_share/containerlab_topologies && \
    chmod -R 777 /home/clab_nfs_share

# Ensure uploads directory exists
RUN mkdir -p uploads

# Make the startup script executable
RUN chmod +x start.sh

# Expose the port the app runs on
EXPOSE 3001
# Expose containerlab API server port
EXPOSE 8080

# Command to run the application
CMD ["./start.sh"] 