#!/bin/bash

# Start the containerlab API server in the background
echo "Starting containerlab API server..."
containerlab tools api-server start &

# Wait a moment to ensure it starts properly
sleep 3

# Start the Express server in the foreground
echo "Starting Express API server..."
node server.js 