// Configuration for containerlab-api
// Values are read from environment variables with fallback defaults
// Update clab-config.env in the repo root and run setup.sh to change settings
module.exports = {
  // Server IP where this service is running
  serverIp: process.env.SERVER_IP || 'localhost',

  // API port settings
  expressApiPort: parseInt(process.env.BACKEND_API_PORT || '3001', 10),
  containerLabApiPort: parseInt(process.env.CONTAINERLAB_API_PORT || '8080', 10),

  // Default directory structure
  baseTopologyDirectory: process.env.TOPOLOGY_PATH || '/home/clab_nfs_share/containerlab_topologies',

  // SSH password for backend operations (username comes from the logged-in user)
  sshPassword: process.env.SSH_PASSWORD || 'ul678clab'
}; 