/**
 * ClabServers.js - Containerlab Studio Dashboard
 * 
 * Copyright (c) 2024-2025 Arista Networks, Inc.
 * 
 * Author: Kishore Sukumaran
 * 
 * This component provides the main dashboards page for managing containerlab servers and containerlab topologies running on them.
 * It displays server status, metrics, and allows users to view, reconfigure, destroy, and save
 * containerlab topologies across multiple servers.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Server } from 'lucide-react';
import LogModal from './LogModal';
import SshModal from './SshModal';
import TopologyModal from './topology/TopologyModal';
import { parseContainerlabYaml } from './topology/topologyParser';

const ClabServers = ({ user }) => {
  const [topologies, setTopologies] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState({});
  const [expanded, setExpanded] = useState({});
  const [selectedServer, setSelectedServer] = useState(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [operationLogs, setOperationLogs] = useState('');
  const [operationTitle, setOperationTitle] = useState('');
  const [showSshModal, setShowSshModal] = useState(false);
  const [selectedTopologyNodes, setSelectedTopologyNodes] = useState([]);
  const [serverMetrics, setServerMetrics] = useState({});
  const [authTokens, setAuthTokens] = useState({});
  const [showTopologyModal, setShowTopologyModal] = useState(false);
  const [topologyViewData, setTopologyViewData] = useState(null);
  const [topologyViewName, setTopologyViewName] = useState('');
  const [openActionsDropdown, setOpenActionsDropdown] = useState(null);
  const actionsDropdownRef = useRef(null);

  const closeActionsDropdown = useCallback((e) => {
    if (actionsDropdownRef.current && !actionsDropdownRef.current.contains(e.target)) {
      setOpenActionsDropdown(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', closeActionsDropdown);
    return () => document.removeEventListener('mousedown', closeActionsDropdown);
  }, [closeActionsDropdown]);

  /**
   * List of containerlab servers available in the environment.
   * These servers have containerlab installed and are used to deploy and manage network topologies.
   * Each server is displayed in the dashboard with its status, metrics, and hosted topologies.
   * The dashboard connects to these servers via their IP addresses to perform operations like:
   * - Fetching deployed topologies
   * - Reconfiguring topologies
   * - Destroying topologies
   * - Saving configurations
   * - SSH connections to containers
   */
  const servers = [
    { name: 'ul-clab-1', ip: '10.83.12.237' },
  ];
  
  /**
   * Get an authentication token from the containerlab API
   * 
   * @param {string} serverIp - The IP address of the server to authenticate with
   * @returns {Promise<string>} - JWT token for authentication
   */
  const getAuthToken = async (serverIp) => {
    // Check if we already have a valid token
    if (authTokens[serverIp]) {
      return authTokens[serverIp];
    }
    
    try {
      const loginResponse = await fetch(`/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: user?.username || 'admin',
          password: 'ul678clab'
        }),
      });
      
      if (!loginResponse.ok) {
        const errorData = await loginResponse.json();
        throw new Error(`Failed to authenticate: ${JSON.stringify(errorData)}`);
      }

      const tokenData = await loginResponse.json();
      const token = tokenData.token;
      
      // Store the token for future use
      setAuthTokens(prev => ({
        ...prev,
        [serverIp]: token
      }));
      
      return token;
    } catch (error) {
      console.error("Authentication error:", error);
      throw error;
    }
  };
  
  /**
   * Fetches deployed containerlab topologies from a specific server.
   * 
   * @param {string} serverIp - The IP address of the server to fetch topologies from
   * 
   * This function:
   * 1. Gets an auth token for the containerlab API
   * 2. Uses that token to fetch topologies using the official containerlab API
   * 3. Transforms the raw containerlab data into a structured format for the UI
   * 4. Updates component state with the fetched topologies and their initial expanded state
   * 5. Sets loading and error states appropriately during the process
   */
  const fetchTopologies = async (serverIp) => {
    // Initialize loading state and clear any previous errors for this server
    setLoading(prev => ({ ...prev, [serverIp]: true }));
    setError(prev => ({ ...prev, [serverIp]: null }));
    setTopologies({});
    
    try {
      console.log(`Fetching topologies from ${serverIp} using direct API...`);
      
      // Get authentication token
      const token = await getAuthToken(serverIp);
      
      // Now fetch the labs using the token
      const response = await fetch(`/api/v1/labs`, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response:', errorData);
        throw new Error(`Failed to fetch topology data from ${serverIp}: ${JSON.stringify(errorData)}`);
      }
      
      // Process successful API response
      const data = await response.json();
      console.log('Raw API data:', data);
      
      // Validate the response data format
      if (!data || typeof data !== 'object') {
        throw new Error(`Invalid data format received from ${serverIp}`);
      }

      // Transform the API data into the studio's internal format
      // The API response structure is grouped by lab name
      const transformedData = Object.entries(data).map(([labName, nodes]) => {
        if (!Array.isArray(nodes) || nodes.length === 0) {
          console.warn(`No nodes found for lab ${labName}`);
          return null;
        }
        
        // Extract common lab information from the first node
        const firstNode = nodes[0];
        if (!firstNode) {
          console.warn(`Invalid node data for lab ${labName}`);
          return null;
        }
        
        return {
          topology: labName,
          labPath: firstNode.labPath || firstNode.absLabPath,
          labName: firstNode.lab_name,
          labOwner: firstNode.owner,
          status: firstNode.status || 'N/A', // Add status from the first node
          nodes: nodes.map(node => ({
            name: node.name,
            kind: node.kind,
            image: node.image,
            state: node.state,
            status: node.status || 'N/A',
            ipAddress: [node.ipv4_address, node.ipv6_address].filter(Boolean)
          }))
        };
      }).filter(Boolean); // Remove any null entries
      
      console.log('Transformed data:', transformedData);

      // Update state with the processed topology data
      setTopologies({ [serverIp]: transformedData });
      
      // Initialize the expanded state for each topology (all collapsed by default)
      const initialExpandedState = {};
      transformedData.forEach(topology => {
        initialExpandedState[topology.topology] = false;
      });
      setExpanded({ [serverIp]: initialExpandedState });
    } catch (err) {
      // Handle and log any errors that occurred during the fetch operation
      console.error('Error in fetchTopologies:', err);
      setError(prev => ({ ...prev, [serverIp]: err.message }));
    } finally {
      // reset the loading state when done, regardless of success or failure
      setLoading(prev => ({ ...prev, [serverIp]: false }));
    }
  };

  const toggleExpand = (serverIp, topologyName) => {
    setExpanded(prev => ({
      ...prev,
      [serverIp]: {
        ...prev[serverIp],
        [topologyName]: !prev[serverIp]?.[topologyName]
      }
    }));
  };

  /**
   * Fetches system performance metrics (CPU and memory usage) from a containerlab server.
   * 
   * @param {string} serverIp - The IP address of the server to fetch metrics from
   * 
   * This function:
   * 1. Makes an API call to the system metrics endpoint on the specified server
   * 2. Retrieves current CPU and memory utilization percentages
   * 3. Updates the serverMetrics state with the latest performance data
   * 
   * The metrics are displayed in the server table and help users monitor
   * the load on each containerlab server. This data is particularly useful
   * when deciding which server to deploy new topologies to.
   * 
   * This function is called both on component mount and periodically (every 30 seconds)
   * to keep the metrics up to date.
   */
  const fetchSystemMetrics = async (serverIp) => {
    try {
      const response = await fetch(`http://${serverIp}:3001/api/system/metrics`);
      if (!response.ok) {
        throw new Error(`Failed to fetch metrics from ${serverIp}`);
      }
      const data = await response.json();
      console.log(`Debug - Metrics from ${serverIp}:`, data);
      if (data.success) {
        setServerMetrics(prev => {
          const updatedMetrics = {
            ...prev,
            [serverIp]: data.metrics
          };
          console.log(`Debug - Updated metrics for ${serverIp}:`, updatedMetrics[serverIp]);
          return updatedMetrics;
        });
      }
    } catch (error) {
      console.error('Error fetching system metrics:', error);
    }
  };

  /**
   * Effect hook to initialize and maintain system metrics for all servers.
   * 
   * This effect:
   * 1. Runs once when the component mounts (empty dependency array)
   * 2. Fetches initial system metrics (CPU and memory usage) for all servers
   * 3. Sets up a recurring interval to refresh metrics every 30 seconds
   * 4. Properly cleans up the interval when the component unmounts
   * 
   * The regular polling ensures that the dashboard always displays current
   * performance data, allowing users to make informed decisions about which
   * servers to use for deploying new topologies based on current load.
   * 
   * The 30-second refresh interval balances between having current data
   * and avoiding excessive API calls to the servers.
   */
  useEffect(() => {
    servers.forEach(server => {
      fetchSystemMetrics(server.ip);
    });

    // Set up interval to refresh metrics every 30 seconds
    const intervalId = setInterval(() => {
      servers.forEach(server => {
        fetchSystemMetrics(server.ip);
      });
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  /**
   * Fetches all containerlab topologies from all available servers.
   * 
   * This function:
   * 1. Fetches topology data from all servers in parallel using Promise.all
   * 2. Authenticates with each server and uses the official containerlab API 
   * 3. Transforms the data into a consistent format for the UI
   * 4. Handles errors individually for each server without failing the entire operation
   * 5. Updates the UI state with all discovered topologies across all servers
   * 
   * This is used for the "Fetch All Topologies" view in the dashboard, showing every
   * containerlab topology regardless of ownership.
   */
  const fetchAllTopologies = async () => {
    setLoading(prev => ({ ...prev, all: true }));
    setError(prev => ({ ...prev, all: null }));
    setTopologies({});
    
    try {
      // Fetch topologies from each server in parallel
      const topologyPromises = servers.map(async (server) => {
        try {
          // Get authentication token
          const token = await getAuthToken(server.ip);
          
          // Now fetch the labs using the token
          const response = await fetch(`/api/v1/labs`, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error from server ${server.ip}: ${JSON.stringify(errorData)}`);
          }
          
          const data = await response.json();
          
          // Transform the API data into our expected format for studio
          const transformedData = Object.entries(data).map(([labName, nodes]) => {
            if (!nodes || nodes.length === 0) return null;
            
            const firstNode = nodes[0];
            return {
              topology: labName,
              labPath: firstNode.labPath || firstNode.absLabPath,
              labName: firstNode.lab_name,
              labOwner: firstNode.owner,
              status: firstNode.status || 'N/A', // Add status from the first node
              nodes: nodes.map(node => ({
                name: node.name,
                kind: node.kind,
                image: node.image,
                state: node.state,
                status: node.status || 'N/A',
                ipAddress: [node.ipv4_address, node.ipv6_address].filter(Boolean)
              }))
            };
          }).filter(Boolean);

          return { server, data: transformedData };
        } catch (error) {
          console.error(`Error fetching from ${server.ip}:`, error);
          return { server, error: error.message };
        }
      });

      const results = await Promise.all(topologyPromises);
      
      // Update the topologies state with results from all servers
      const newTopologies = {};
      const newExpanded = {};
      const newErrors = { ...error };

      results.forEach(({ server, data, error }) => {
        if (data) {
          newTopologies[server.ip] = data;
          const initialExpandedState = {};
          data.forEach(topology => {
            initialExpandedState[topology.topology] = false;
          });
          newExpanded[server.ip] = initialExpandedState;
        }
        if (error) {
          newErrors[server.ip] = error;
        }
      });

      setTopologies(newTopologies);
      setExpanded(newExpanded);
      setError(newErrors);
    } catch (error) {
      setError(prev => ({ ...prev, all: error.message }));
    } finally {
      setLoading(prev => ({ ...prev, all: false }));
    }
  };

  /**
   * Fetches containerlab topologies from all servers but filters them by the logged-in user's ownership.
   * 
   * This function:
   * 1. Authenticates with each server using the official containerlab API
   * 2. Fetches topology data from all servers in parallel
   * 3. Filters the data to only include topologies owned by the logged-in user
   * 4. Transforms the data into a consistent format for the UI
   * 5. Updates the UI state with the filtered topologies
   * 
   * This is used for the "Fetch My Topologies" view in the dashboard, showing only the topologies
   * that the user has created or has access to.
   */
  const fetchMyTopologies = async () => {
    setLoading(prev => ({ ...prev, my: true }));
    setError(prev => ({ ...prev, my: null }));
    setTopologies({});
    
    const loggedInUser = user?.username?.toLowerCase().trim();
    console.log('Logged in user:', loggedInUser);
    
    try {
      // Fetch topologies from each server in parallel
      const topologyPromises = servers.map(async (server) => {
        try {
          // Get authentication token
          const token = await getAuthToken(server.ip);
          
          // Now fetch the labs using the token
          const response = await fetch(`/api/v1/labs`, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error from server ${server.ip}: ${JSON.stringify(errorData)}`);
          }
          
          const data = await response.json();
          console.log('Raw data from server:', server.ip, data);
          
          // Transform the data into our expected format and filter by owner
          const transformedData = Object.entries(data)
            .filter(([_, nodes]) => {
              if (!nodes || nodes.length === 0) return false;
              const firstNode = nodes[0];
              const labOwner = firstNode.owner?.toLowerCase().trim();
              console.log('Comparing:', {
                labOwner,
                loggedInUser,
                matches: labOwner === loggedInUser
              });
              return labOwner === loggedInUser;
            })
            .map(([labName, nodes]) => {
              const firstNode = nodes[0];
              return {
                topology: labName,
                labPath: firstNode.labPath || firstNode.absLabPath,
                labName: firstNode.lab_name,
                labOwner: firstNode.owner,
                status: firstNode.status || 'N/A', // Add status from the first node
                nodes: nodes.map(node => ({
                  name: node.name,
                  kind: node.kind,
                  image: node.image,
                  state: node.state,
                  status: node.status || 'N/A',
                  ipAddress: [node.ipv4_address, node.ipv6_address].filter(Boolean)
                }))
              };
            });

          console.log('Filtered data for server:', server.ip, transformedData);
          return { server, data: transformedData };
        } catch (error) {
          return { server, error: error.message };
        }
      });

      const results = await Promise.all(topologyPromises);
      
      // Update the topologies state with results from all servers
      const newTopologies = {};
      const newExpanded = {};
      const newErrors = { ...error };

      results.forEach(({ server, data, error }) => {
        if (data) {
          newTopologies[server.ip] = data;
          const initialExpandedState = {};
          data.forEach(topology => {
            initialExpandedState[topology.topology] = false;
          });
          newExpanded[server.ip] = initialExpandedState;
        }
        if (error) {
          newErrors[server.ip] = error;
        }
      });

      setTopologies(newTopologies);
      setExpanded(newExpanded);
      setError(newErrors);
    } catch (error) {
      setError(prev => ({ ...prev, my: error.message }));
    } finally {
      setLoading(prev => ({ ...prev, my: false }));
    }
  };

  /**
   * Below is the HTML that renders the main dashboard page for managing containerlab servers and topologies.
   * 
   * This Page:
   * 1. Displays a header with buttons to fetch all topologies or topologies owned by the logged-in user
   * 2. Displays a table of servers with their status, metrics, and actions
   * 3. Displays topologies for each server in a collapsible section
   * 
   * The dashboard provides a comprehensive view of all containerlab servers and their topologies,
   * allowing users to monitor and manage their network environments efficiently.
   */
  return (
    <div className="p-6 max-w-full">
      <div className="servers-header">
        <h2>Available Servers</h2>
        <div className="button-group">
          <button 
            className="fetch-all-button"
            onClick={fetchAllTopologies}
            disabled={loading.all}
          >
            {loading.all ? (
              <div className="flex items-center">
                <Loader2 className="animate-spin mr-2" size={18} />
                Loading...
              </div>
            ) : (
              "Fetch All Topologies"
            )}
          </button>
          <button 
            className="fetch-my-button"
            onClick={fetchMyTopologies}
            disabled={loading.my}
          >
            {loading.my ? (
              <div className="flex items-center">
                <Loader2 className="animate-spin mr-2" size={18} />
                Loading...
              </div>
            ) : (
              "Fetch My Topologies"
            )}
          </button>
        </div>
      </div>
      <table className="server-table">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-200 px-4 py-2 text-left">Server Name</th>
            <th className="border border-gray-200 px-4 py-2 text-left">IP Address</th>
            <th className="border border-gray-200 px-4 py-2 text-left" style={{ width: '80px' }}>Status</th>
            <th className="border border-gray-200 px-4 py-2 text-left">CPU Usage</th>
            <th className="border border-gray-200 px-4 py-2 text-left">Memory Usage</th>
            <th className="border border-gray-200 px-4 py-2 text-left">Available Memory</th>
            <th className="border border-gray-200 px-4 py-2 text-left" style={{ minWidth: '240px' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {/* This is a list of servers to display in the table. Right now it is hardcoded, any changes to the servers will need to be made here. */}
          {[
            { name: 'ul-clab-1', ip: '10.83.12.237', status: 'active' }
          ].map((server) => (
            <tr key={server.name} className="hover:bg-gray-50">
              <td className="border border-gray-200 px-4 py-2">
                <div className="server-info">
                  <Server className="server-icon" />
                  <span className="server-name">{server.name}</span>
                </div>
              </td>
              <td className="border border-gray-200 px-4 py-2">{server.ip}</td>
              <td className="border border-gray-200 px-4 py-2">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  server.status === 'active' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {server.status}
                </span>
              </td>
              <td className="border border-gray-200 px-4 py-2">
                <div className="flex items-center">
                  <div className="w-full bg-gray-200 rounded-full h-2.5" style={{ width: '100%', height: '10px', backgroundColor: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
                    <div 
                      className={`h-2.5 rounded-full ${
                        serverMetrics[server.ip]?.cpu > 80 ? 'bg-red-600' :
                        serverMetrics[server.ip]?.cpu > 60 ? 'bg-yellow-600' :
                        'bg-blue-600'
                      }`}
                      style={{ 
                        width: `${serverMetrics[server.ip]?.cpu || 0}%`,
                        height: '100%',
                        backgroundColor: serverMetrics[server.ip]?.cpu > 80 ? '#dc2626' : 
                                       serverMetrics[server.ip]?.cpu > 60 ? '#d97706' : 
                                       '#2563eb'
                      }}
                    ></div>
                  </div>
                  <span className="ml-2 text-sm">{serverMetrics[server.ip]?.cpu || 0}%</span>
                </div>
              </td>
              <td className="border border-gray-200 px-4 py-2">
                <div className="flex items-center">
                  <div className="w-full bg-gray-200 rounded-full h-2.5" style={{ width: '100%', height: '10px', backgroundColor: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
                    <div 
                      className={`h-2.5 rounded-full ${
                        serverMetrics[server.ip]?.memory > 80 ? 'bg-red-600' :
                        serverMetrics[server.ip]?.memory > 60 ? 'bg-yellow-600' :
                        'bg-green-600'
                      }`}
                      style={{ 
                        width: `${serverMetrics[server.ip]?.memory || 0}%`,
                        height: '100%',
                        backgroundColor: serverMetrics[server.ip]?.memory > 80 ? '#dc2626' : 
                                       serverMetrics[server.ip]?.memory > 60 ? '#d97706' : 
                                       '#16a34a'
                      }}
                    ></div>
                  </div>
                  <span className="ml-2 text-sm">{serverMetrics[server.ip]?.memory || 0}%</span>
                </div>
              </td>
              <td className="border border-gray-200 px-4 py-2">
                <span className="text-sm font-medium">
                  {serverMetrics[server.ip]?.availableMemory?.formatted || "N/A"}
                </span>
              </td>
              <td className="border border-gray-200 px-4 py-2">
                <div className="server-action-buttons">
                  <button 
                    onClick={() => fetchTopologies(server.ip)}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                    disabled={loading[server.ip]}
                  >
                    {loading[server.ip] ? (
                      <div className="flex items-center">
                        <Loader2 className="animate-spin mr-1" size={16} />
                        Loading...
                      </div>
                    ) : (
                      "Fetch Topologies"
                    )}
                  </button>
                  <button 
                    onClick={() => window.open(`http://${server.ip}:5001`, '_blank')}
                    className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                  >
                    EdgeShark
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Display topologies for all servers when using Fetch All Topologies */}
      {Object.keys(topologies).length > 0 && (
        <div className="mt-8">
          {Object.entries(topologies).map(([serverIp, serverTopologies]) => {
            // Find the server name based on serverIp
            const server = servers.find(s => s.ip === serverIp);
            const serverName = server ? server.name : serverIp; // Use name if found, otherwise use IP

            // Skip rendering this server if it has no topologies and we're in "Fetch my topologies" mode
            if (serverTopologies.length === 0 && loading.my === false) {
              return null;
            }

            return (
              <div key={serverIp} className="mb-8">
                <div className="topology-header-section">
                  <h3 className="topology-title">Topologies in {serverName} ({serverIp})</h3>
                  <div className="topology-stats">
                    <div className="count-badge">
                      Total Topologies: {serverTopologies.length}
                    </div>
                    <div className="count-badge">
                      Total Nodes: {serverTopologies.reduce((sum, topology) => 
                        sum + topology.nodes.length, 0
                      )}
                    </div>
                  </div>
                </div>
                {error[serverIp] && (
                  <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    Error: {error[serverIp]}
                  </div>
                )}
                {serverTopologies.length === 0 && !loading[serverIp] && !error[serverIp] && !loading.my ? (
                  <div className="no-topology-message">
                    No topology deployed by the user {user?.username}
                  </div>
                ) : (
                  serverTopologies.map((topology, index) => (
                    <div key={index} className="mb-8">
                      <div 
                        className="topology-header"
                        onClick={() => toggleExpand(serverIp, topology.topology)}
                      >
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center">
                            <span className="text-gray-500"><strong>Lab Name: </strong></span>
                            <span className="ml-1 font-medium">{topology.topology}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-500"><strong>Owner: </strong></span>
                            <span className="ml-1 font-medium">{topology.labOwner}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-500"><strong>Topology File: </strong></span>
                            <span className="ml-1 font-medium truncate">{topology.labPath}</span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-gray-500"><strong>Status: </strong></span>
                            <span className="ml-1 font-medium">{topology.status}</span>
                          </div>
                        </div>

                        <div className="flex items-center">
                          <div className="topology-actions mr-4">
                            <div className="actions-dropdown-container" ref={openActionsDropdown === `${serverIp}-${topology.topology}` ? actionsDropdownRef : null}>
                              <button
                                className="action-button actions-toggle-button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const key = `${serverIp}-${topology.topology}`;
                                  setOpenActionsDropdown(prev => prev === key ? null : key);
                                }}
                              >
                                Actions &#9662;
                              </button>
                              {openActionsDropdown === `${serverIp}-${topology.topology}` && (
                                <div className="actions-dropdown-menu">
                                  <button
                                    className={`actions-dropdown-item reconfigure-item ${
                                      topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase() ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsDropdown(null);

                                      // Check if the current user is the owner of the topology
                                      // This is to prevent users from reconfiguring topologies that they do not own
                                      if (topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase()) {
                                        alert('You can only reconfigure topologies that you own');
                                        return;
                                      }

                                      if (window.confirm('Are you sure you want to reconfigure this topology?')) {
                                        try {
                                          setOperationTitle('Reconfiguring Topology');
                                          setOperationLogs('');
                                          setShowLogModal(true);
                                          console.log("Sending reconfigure request:", {
                                            serverIp: serverIp,
                                            topoFile: topology.labPath
                                          });

                                          // Get authentication token
                                          const token = await getAuthToken(serverIp);

                                          // This is the API call to reconfigure the topology using the direct containerlab API
                                          const response = await fetch(`/api/v1/labs/deploy`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json',
                                              'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify({
                                              topo_file: topology.labPath,
                                              reconfigure: true
                                            }),
                                          });

                                          // Read the streaming response
                                          const reader = response.body.getReader();
                                          const decoder = new TextDecoder();
                                          let finalJsonStr = '';
                                          let buffer = '';

                                          while (true) {
                                            const { value, done } = await reader.read();
                                            if (done) break;

                                            const text = decoder.decode(value);
                                            buffer += text;
                                            const lines = buffer.split('\n');
                                            buffer = lines.pop() || '';

                                            for (const line of lines) {
                                              try {
                                                JSON.parse(line);
                                                finalJsonStr = line;
                                              } catch {
                                                setOperationLogs(prevLogs => prevLogs + line + '\n');
                                              }
                                            }
                                          }
                                          if (buffer) {
                                            try {
                                              JSON.parse(buffer);
                                              finalJsonStr = buffer;
                                            } catch {
                                              setOperationLogs(prevLogs => prevLogs + buffer + '\n');
                                            }
                                          }

                                          // Check if response was successful
                                          if (response.ok) {
                                            setTimeout(() => {
                                              setShowLogModal(true);
                                              alert('Topology reconfigured successfully');
                                              fetchAllTopologies();
                                            }, 2000);
                                          } else {
                                            alert(`Failed to reconfigure topology: ${finalJsonStr || response.statusText}`);
                                          }
                                        } catch (error) {
                                          console.error('Error reconfiguring topology:', error);
                                          alert(`Error reconfiguring topology: ${error.message}`);
                                          setShowLogModal(false);
                                        }
                                      }
                                    }}
                                  >
                                    Reconfigure
                                  </button>
                                  <button
                                    className={`actions-dropdown-item destroy-item ${
                                      topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase() ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsDropdown(null);

                                      // Check if the current user is the owner of the topology
                                      // This is to prevent users from destroying topologies that they do not own
                                      if (topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase()) {
                                        alert('You can only destroy topologies that you own');
                                        return;
                                      }

                                      if (window.confirm('Are you sure you want to destroy this topology?')) {
                                        try {
                                          setOperationTitle('Destroying Topology');
                                          setOperationLogs('');
                                          setShowLogModal(true);
                                          console.log("Sending destroy request:", {
                                            serverIp: serverIp,
                                            topoFile: topology.labPath
                                          });

                                          // Get authentication token
                                          const token = await getAuthToken(serverIp);

                                          // This is the API call to destroy the topology using the containerlab API
                                          const response = await fetch(`http://${serverIp}:3001/api/containerlab/destroy`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                              serverIp: serverIp,
                                              topoFile: topology.labPath,
                                              username: user?.username
                                            }),
                                          });

                                          // Read the streaming response
                                          const reader = response.body.getReader();
                                          const decoder = new TextDecoder();
                                          let finalJsonStr = '';
                                          let buffer = '';
                                          /* Below is the code to read the response from the API call to destroy the topology */
                                          while (true) {
                                            const { value, done } = await reader.read();
                                            if (done) break;

                                            const text = decoder.decode(value);
                                            buffer += text;
                                            const lines = buffer.split('\n');
                                            buffer = lines.pop() || '';

                                            for (const line of lines) {
                                              try {
                                                JSON.parse(line);
                                                finalJsonStr = line;
                                              } catch {
                                                setOperationLogs(prevLogs => prevLogs + line + '\n');
                                              }
                                            }
                                          }
                                          if (buffer) {
                                            try {
                                              JSON.parse(buffer);
                                              finalJsonStr = buffer;
                                            } catch {
                                              setOperationLogs(prevLogs => prevLogs + buffer + '\n');
                                            }
                                          }

                                          // Check if response was successful
                                          if (response.ok) {
                                            setTimeout(() => {
                                              setShowLogModal(true);
                                              alert('Topology destroyed successfully');
                                              fetchAllTopologies();
                                            }, 2000);
                                          } else {
                                            alert(`Failed to destroy topology: ${finalJsonStr || response.statusText}`);
                                          }
                                        } catch (error) {
                                          console.error('Error destroying topology:', error);
                                          alert(`Error destroying topology: ${error.message}`);
                                          setShowLogModal(false);
                                        }
                                      }
                                    }}
                                  >
                                    Destroy
                                  </button>
                                  <button
                                    className={`actions-dropdown-item save-item ${
                                      topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase() ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsDropdown(null);

                                      // Check if the current user is the owner of the topology
                                      // This is to prevent users from saving topologies that they do not own
                                      if (topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase()) {
                                        alert('You can only save topologies that you own');
                                        return;
                                      }

                                      if (window.confirm('Are you sure you want to save this topology?')) {
                                        try {
                                          setOperationTitle('Saving Topology');
                                          setOperationLogs('');
                                          setShowLogModal(true);
                                          console.log("Sending saving request:", {
                                            serverIp: serverIp,
                                            topoFile: topology.labPath
                                          });

                                          // Get authentication token
                                          const token = await getAuthToken(serverIp);

                                          // This is the API call to save the topology using the containerlab API
                                          const response = await fetch(`http://${serverIp}:3001/api/containerlab/save`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                              serverIp: serverIp,
                                              topoFile: topology.labPath,
                                              username: user?.username
                                            }),
                                          });

                                          // Read the streaming response
                                          const reader = response.body.getReader();
                                          const decoder = new TextDecoder();
                                          let finalJsonStr = '';
                                          let buffer = '';

                                          /* Below is the code to read the response from the API call to save the topology */
                                          while (true) {
                                            const { value, done } = await reader.read();
                                            if (done) break;

                                            const text = decoder.decode(value);
                                            buffer += text;
                                            const lines = buffer.split('\n');
                                            buffer = lines.pop() || '';

                                            for (const line of lines) {
                                              try {
                                                JSON.parse(line);
                                                finalJsonStr = line;
                                              } catch {
                                                setOperationLogs(prevLogs => prevLogs + line + '\n');
                                              }
                                            }
                                          }
                                          if (buffer) {
                                            try {
                                              JSON.parse(buffer);
                                              finalJsonStr = buffer;
                                            } catch {
                                              setOperationLogs(prevLogs => prevLogs + buffer + '\n');
                                            }
                                          }

                                          // Check if response was successful
                                          if (response.ok) {
                                            setTimeout(() => {
                                              setShowLogModal(true);
                                              alert('Topology saved successfully');
                                              fetchAllTopologies();
                                            }, 2000);
                                          } else {
                                            alert(`Failed to save topology: ${finalJsonStr || response.statusText}`);
                                          }
                                        } catch (error) {
                                          console.error('Error saving topology:', error);
                                          alert(`Error saving topology: ${error.message}`);
                                          setShowLogModal(false);
                                        }
                                      }
                                    }}
                                  >
                                    Save
                                  </button>
                                  <button
                                    className={`actions-dropdown-item stop-item ${
                                      topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase() ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsDropdown(null);

                                      if (topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase()) {
                                        alert('You can only stop topologies that you own');
                                        return;
                                      }

                                      if (window.confirm('Are you sure you want to stop all containers for this topology?')) {
                                        try {
                                          setOperationTitle('Stopping Topology');
                                          setOperationLogs('');
                                          setShowLogModal(true);
                                          console.log("Sending stop request:", {
                                            serverIp: serverIp,
                                            topologyName: topology.topology
                                          });

                                          const response = await fetch(`http://${serverIp}:3001/api/containerlab/stop`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                              serverIp: serverIp,
                                              topologyName: topology.topology,
                                              username: user?.username
                                            }),
                                          });

                                          const reader = response.body.getReader();
                                          const decoder = new TextDecoder();
                                          let finalJsonStr = '';
                                          let buffer = '';

                                          while (true) {
                                            const { value, done } = await reader.read();
                                            if (done) break;

                                            const text = decoder.decode(value);
                                            buffer += text;
                                            const lines = buffer.split('\n');
                                            buffer = lines.pop() || '';

                                            for (const line of lines) {
                                              try {
                                                JSON.parse(line);
                                                finalJsonStr = line;
                                              } catch {
                                                setOperationLogs(prevLogs => prevLogs + line + '\n');
                                              }
                                            }
                                          }
                                          if (buffer) {
                                            try {
                                              JSON.parse(buffer);
                                              finalJsonStr = buffer;
                                            } catch {
                                              setOperationLogs(prevLogs => prevLogs + buffer + '\n');
                                            }
                                          }

                                          let stopResult = {};
                                          try { stopResult = JSON.parse(finalJsonStr); } catch {}

                                          if (stopResult.success) {
                                            setTimeout(() => {
                                              setShowLogModal(true);
                                              alert('Topology stopped successfully');
                                              fetchAllTopologies();
                                            }, 2000);
                                          } else {
                                            alert(`Failed to stop topology: ${stopResult.error || stopResult.message || response.statusText}`);
                                          }
                                        } catch (error) {
                                          console.error('Error stopping topology:', error);
                                          alert(`Error stopping topology: ${error.message}`);
                                          setShowLogModal(false);
                                        }
                                      }
                                    }}
                                  >
                                    Stop
                                  </button>
                                  <button
                                    className={`actions-dropdown-item redeploy-item ${
                                      topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase() ? "opacity-50 cursor-not-allowed" : ""
                                    }`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setOpenActionsDropdown(null);

                                      if (topology.labOwner?.toLowerCase() !== user?.username?.toLowerCase()) {
                                        alert('You can only redeploy topologies that you own');
                                        return;
                                      }

                                      if (window.confirm('Are you sure you want to redeploy this topology? This will destroy and then deploy the topology.')) {
                                        try {
                                          setOperationTitle('Redeploying Topology');
                                          setOperationLogs('');
                                          setShowLogModal(true);
                                          console.log("Sending redeploy request:", {
                                            serverIp: serverIp,
                                            topoFile: topology.labPath
                                          });

                                          const response = await fetch(`http://${serverIp}:3001/api/containerlab/redeploy`, {
                                            method: 'POST',
                                            headers: {
                                              'Content-Type': 'application/json'
                                            },
                                            body: JSON.stringify({
                                              serverIp: serverIp,
                                              topoFile: topology.labPath,
                                              username: user?.username
                                            }),
                                          });

                                          const reader = response.body.getReader();
                                          const decoder = new TextDecoder();
                                          let finalJsonStr = '';
                                          let buffer = '';

                                          while (true) {
                                            const { value, done } = await reader.read();
                                            if (done) break;

                                            const text = decoder.decode(value);
                                            buffer += text;
                                            const lines = buffer.split('\n');
                                            buffer = lines.pop() || '';

                                            for (const line of lines) {
                                              try {
                                                JSON.parse(line);
                                                finalJsonStr = line;
                                              } catch {
                                                setOperationLogs(prevLogs => prevLogs + line + '\n');
                                              }
                                            }
                                          }
                                          if (buffer) {
                                            try {
                                              JSON.parse(buffer);
                                              finalJsonStr = buffer;
                                            } catch {
                                              setOperationLogs(prevLogs => prevLogs + buffer + '\n');
                                            }
                                          }

                                          let redeployResult = {};
                                          try { redeployResult = JSON.parse(finalJsonStr); } catch {}

                                          if (redeployResult.success) {
                                            setTimeout(() => {
                                              setShowLogModal(true);
                                              alert('Topology redeployed successfully');
                                              fetchAllTopologies();
                                            }, 2000);
                                          } else {
                                            alert(`Failed to redeploy topology: ${redeployResult.error || redeployResult.message || response.statusText}`);
                                          }
                                        } catch (error) {
                                          console.error('Error redeploying topology:', error);
                                          alert(`Error redeploying topology: ${error.message}`);
                                          setShowLogModal(false);
                                        }
                                      }
                                    }}
                                  >
                                    Redeploy
                                  </button>
                                </div>
                              )}
                            </div>
                            <button // This is the button to SSH into the nodes in the topology
                              className="action-button ssh-button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                setSelectedTopologyNodes(topology.nodes);
                                setSelectedServer(serverIp);
                                setShowSshModal(true);
                              }}
                            >
                              SSH
                            </button>
                            <button
                              className="action-button topology-view-button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(
                                    `http://${serverIp}:3001/api/files/read?path=${encodeURIComponent(topology.labPath)}&serverIp=${encodeURIComponent(serverIp)}&username=${encodeURIComponent(user?.username || 'admin')}`
                                  );
                                  const data = await res.json();
                                  if (!data.content) {
                                    alert('Could not read topology file');
                                    return;
                                  }
                                  const parsed = parseContainerlabYaml(data.content);
                                  setTopologyViewData(parsed);
                                  setTopologyViewName(topology.topology || parsed.name);
                                  setShowTopologyModal(true);
                                } catch (err) {
                                  console.error('Error loading topology:', err);
                                  alert(`Error loading topology: ${err.message}`);
                                }
                              }}
                            >
                              Topology
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* This is the table that displays the nodes in the topology */}
                      {expanded[serverIp]?.[topology.topology] && (
                        <div className="overflow-x-auto">
                          <table className="topology-table">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Kind
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Image
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  State
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  IP Address
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {topology.nodes.map((node, nodeIndex) => (
                                <tr key={nodeIndex} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {node.name}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {node.kind}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {node.image}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs ${
                                      node.state === 'running' 
                                        ? 'bg-green-100 text-green-800' 
                                        : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {node.state}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {node.status}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {node.ipAddress.map((ip, ipIdx) => (
                                      <div key={ipIdx}>{ip}</div>
                                    ))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
      <LogModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        logs={operationLogs}
        title={operationTitle}
      />
      <SshModal
        isOpen={showSshModal}
        onClose={() => setShowSshModal(false)}
        nodes={selectedTopologyNodes}
        serverIp={selectedServer}
      />
      <TopologyModal
        isOpen={showTopologyModal}
        onClose={() => setShowTopologyModal(false)}
        topologyData={topologyViewData}
        topologyName={topologyViewName}
      />
    </div>
  );
};

export default ClabServers;