/**
 * Centralized configuration for Containerlab Studio
 *
 * These values are set from environment variables at build time.
 * To change them, update /opt/clab-config.env and run setup-clab-studio.sh
 */

// Server IP and API URLs
export const SERVER_IP = process.env.REACT_APP_SERVER_IP || 'localhost';
export const AUTH_API_URL = process.env.REACT_APP_AUTH_API_URL || `http://${SERVER_IP}:3000`;
export const BACKEND_API_URL = process.env.REACT_APP_BACKEND_API_URL || `http://${SERVER_IP}:3001`;
export const CONTAINERLAB_API_URL = process.env.REACT_APP_CONTAINERLAB_API_URL || `http://${SERVER_IP}:8080`;

/**
 * Parse the CLAB_SERVERS environment variable into an array of server objects
 * Format: "name1:ip1,name2:ip2"
 * Returns: [{ name: 'name1', ip: 'ip1' }, { name: 'name2', ip: 'ip2' }]
 */
export const parseClabServers = () => {
  const serversStr = process.env.REACT_APP_CLAB_SERVERS || `ul-clab-1:${SERVER_IP}`;
  return serversStr.split(',').map(server => {
    const [name, ip] = server.trim().split(':');
    return { name: name.trim(), ip: ip.trim() };
  });
};

/**
 * Get the list of containerlab servers
 * Returns array of { name, ip } objects
 */
export const getClabServers = () => {
  return parseClabServers();
};

/**
 * Get server options for dropdowns (value/label format)
 */
export const getServerOptions = () => {
  return parseClabServers().map(server => ({
    value: server.ip,
    label: server.ip
  }));
};

/**
 * Get servers with status for dashboard display
 */
export const getServersWithStatus = () => {
  return parseClabServers().map(server => ({
    ...server,
    status: 'active'
  }));
};

export default {
  SERVER_IP,
  AUTH_API_URL,
  BACKEND_API_URL,
  CONTAINERLAB_API_URL,
  getClabServers,
  getServerOptions,
  getServersWithStatus
};
