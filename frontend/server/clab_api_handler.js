const express = require('express');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');
const yaml = require('js-yaml');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: '*',  // For development - be more restrictive in production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(bodyParser.json());

// Store tokens in memory (consider using Redis or similar in production)
const tokens = {};

// Helper function to get containerlab API URL
const getContainerlabApiUrl = (serverIp) => `http://${serverIp}:8080/api/v1`;

// Middleware to check if token exists
const checkToken = (req, res, next) => {
  const serverIp = req.body.serverIp || req.query.serverIp;
  const token = tokens[serverIp];

  if (!serverIp) {
    return res.status(400).json({ success: false, error: 'Server IP is required' });
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'No token available for this server' });
  }

  req.token = token;
  next();
};

// Login endpoint
app.post('/api/containerlab/login', async (req, res) => {
  try {
    const { serverIp, username, password } = req.body;

    if (!serverIp || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Server IP, username and password are required'
      });
    }

    const response = await axios.post(`http://${serverIp}:8080/login`, {
      username,
      password
    });

    if (response.data.token) {
      // Store the token
      tokens[serverIp] = response.data.token;
      console.log(`Token stored for server ${serverIp}`);
    }

    res.json(response.data);
  } catch (error) {
    console.error(`Failed to get token from ${req.body.serverIp}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// New endpoint to check if a lab exists (for validation before reconfiguring)
app.get('/api/containerlab/labs/inspect/:labName', async (req, res) => {
  try {
    const { serverIp, username } = req.query;
    const { labName } = req.params;
    
    if (!serverIp || !username || !labName) {
      return res.status(400).json({
        success: false,
        error: 'Server IP, username, and lab name are required'
      });
    }
    
    // Get authentication token or use existing one
    let token = tokens[serverIp];
    
    if (!token) {
      try {
        const loginResponse = await axios.post(`http://${serverIp}:8080/login`, {
          username,
          password: 'ul678clab'  // Consider using a more secure approach
        });
        
        token = loginResponse.data.token;
        if (!token) {
          throw new Error('Authentication failed: No token received');
        }
        
        tokens[serverIp] = token;
        console.log(`New token generated for server ${serverIp}`);
      } catch (error) {
        console.error(`Authentication failed for server ${serverIp}:`, error.message);
        return res.status(401).json({
          success: false,
          error: `Authentication failed: ${error.message}`
        });
      }
    }
    
    // Call the inspect endpoint
    try {
      const inspectResponse = await axios.get(
        `http://${serverIp}:8080/api/v1/labs/${labName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );
      
      // If we get here, the lab exists
      return res.json({
        success: true,
        exists: true,
        data: inspectResponse.data
      });
    } catch (error) {
      // Check if it's a 401 (token expired) and try to regenerate token
      if (error.response && error.response.status === 401) {
        console.log(`Token expired for server ${serverIp}, regenerating...`);
        try {
          // Regenerate token
          const loginResponse = await axios.post(`http://${serverIp}:8080/login`, {
            username,
            password: 'ul678clab'
          });
          
          const newToken = loginResponse.data.token;
          if (!newToken) {
            throw new Error('Token regeneration failed: No token received');
          }
          
          tokens[serverIp] = newToken;
          console.log(`Token regenerated for server ${serverIp}`);
          
          // Retry the request with the new token
          try {
            const retryResponse = await axios.get(
              `http://${serverIp}:8080/api/v1/labs/${labName}`,
              {
                headers: {
                  'Authorization': `Bearer ${newToken}`,
                  'Accept': 'application/json'
                }
              }
            );
            
            return res.json({
              success: true,
              exists: true,
              data: retryResponse.data,
              tokenRefreshed: true
            });
          } catch (retryError) {
            // Check if it's a 404 (lab doesn't exist)
            if (retryError.response && retryError.response.status === 404) {
              return res.json({
                success: true,
                exists: false,
                error: 'Lab not found',
                tokenRefreshed: true
              });
            }
            
            throw retryError;
          }
        } catch (tokenError) {
          console.error(`Failed to regenerate token for server ${serverIp}:`, tokenError.message);
          return res.status(401).json({
            success: false,
            error: `Token regeneration failed: ${tokenError.message}`
          });
        }
      }
      
      // Check if it's a 404 (lab doesn't exist)
      if (error.response && error.response.status === 404) {
        return res.json({
          success: true,
          exists: false,
          error: 'Lab not found'
        });
      }
      
      // Other errors
      console.error(`Error inspecting lab ${labName} on server ${serverIp}:`, error.message);
      return res.status(error.response?.status || 500).json({
        success: false,
        exists: false,
        error: error.message,
        details: error.response?.data
      });
    }
  } catch (error) {
    console.error('Unexpected error during lab inspection:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Deploy lab using official containerlab API endpoint
app.post('/api/containerlab/labs/deploy', async (req, res) => {
  const multer = require('multer');
  const fs = require('fs');
  const path = require('path');
  const { Readable } = require('stream');
  
  // Setup multer for file handling
  const storage = multer.memoryStorage();
  const upload = multer({ storage }).single('file');
  
  try {
    // Process uploaded file
    upload(req, res, async function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      const { serverIp, username } = req.body;
      
      if (!serverIp || !username || !req.file) {
        return res.status(400).json({
          success: false,
          error: 'Server IP, username and YAML file are required'
        });
      }
      
      // Set response headers for streaming
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      res.write(`Starting deployment process...\n`);
      res.write(`Target server: ${serverIp}\n`);
      res.write(`Username: ${username}\n`);
      res.write(`Topology file: ${req.file.originalname}\n\n`);
      
      // Get authentication token
      res.write(`Authenticating with containerlab API server...\n`);
      let token = tokens[serverIp];
      
      if (!token) {
        try {
          const loginResponse = await axios.post(`http://${serverIp}:8080/login`, {
            username,
            password: 'ul678clab'  // Consider using a more secure approach
          });
          
          token = loginResponse.data.token;
          if (!token) {
            throw new Error('Authentication failed: No token received');
          }
          
          tokens[serverIp] = token;
          res.write(`Successfully authenticated\n\n`);
        } catch (error) {
          res.write(`Authentication failed: ${error.message}\n`);
          return res.end();
        }
      } else {
        res.write(`Using cached authentication token\n\n`);
      }
      
      // Parse YAML to get lab name and convert to JSON
      try {
        const yamlContent = req.file.buffer.toString('utf8');
        const parsedYaml = yaml.load(yamlContent);
        const labName = parsedYaml.name;
        
        res.write(`Deploying lab "${labName}" to containerlab server...\n\n`);
        
        // Make request to the official containerlab API
        try {
          // Prepare the request data in the expected format
          const requestData = {
            topologyContent: parsedYaml
          };
          
          // Debug what we're sending
          console.log('Sending to containerlab API:', JSON.stringify(requestData, null, 2));
          res.write(`Preparing request to containerlab API...\n\n`);
          
          // Set up a progress indicator that sends updates every 5 seconds
          const progressInterval = setInterval(() => {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format
            res.write(`[${timestamp}] Deployment in progress... Still working\n`);
          }, 5000);
          
          try {
            const deployResponse = await axios({
              method: 'post',
              url: `http://${serverIp}:8080/api/v1/labs`,
              data: requestData,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              responseType: 'stream'
            });
            
            // Clear the progress indicator once we get a response
            clearInterval(progressInterval);
            
            // Stream the response back to the client
            deployResponse.data.on('data', (chunk) => {
              res.write(chunk);
            });
            
            deployResponse.data.on('end', () => {
              res.write('\n\nDeployment completed successfully.');
              res.end();
            });
            
            deployResponse.data.on('error', (err) => {
              // Clear the interval on stream error
              clearInterval(progressInterval);
              res.write(`\n\nStream error: ${err.message}`);
              res.end();
            });
          } catch (error) {
            // Clear the progress interval
            clearInterval(progressInterval);
            
            res.write(`\n\nError making deployment request: ${error.message}\n`);
            
            // Try to extract and display the actual error from containerlab API
            if (error.response) {
              res.write(`Status: ${error.response.status}\n`);
              
              // Handle different response types
              if (error.response.data) {
                // If it's a stream, we need to read it
                if (typeof error.response.data.pipe === 'function') {
                  let errorData = '';
                  error.response.data.on('data', chunk => {
                    errorData += chunk.toString();
                  });
                  error.response.data.on('end', () => {
                    try {
                      // Try to parse as JSON
                      const parsedError = JSON.parse(errorData);
                      res.write(`\nContainerlab error: ${parsedError.error || 'Unknown error'}\n`);
                    } catch (e) {
                      // If not JSON, use as is
                      res.write(`\nContainerlab error: ${errorData}\n`);
                    }
                    res.end();
                  });
                } else {
                  // If it's already parsed JSON or string
                  if (typeof error.response.data === 'string') {
                    res.write(`\nContainerlab error: ${error.response.data}\n`);
                  } else if (error.response.data.error) {
                    res.write(`\nContainerlab error: ${error.response.data.error}\n`);
                  } else {
                    res.write(`\nContainerlab error details: ${JSON.stringify(error.response.data, null, 2)}\n`);
                  }
                  res.end();
                }
              } else {
                res.write('\nNo detailed error information available from containerlab\n');
                res.end();
              }
            } else {
              res.write('\nNo response received from containerlab API server\n');
              res.end();
            }
          }
        } catch (error) {
          res.write(`Error parsing YAML or other unexpected error: ${error.message}\n`);
          res.end();
        }
      } catch (error) {
        res.write(`Error parsing YAML: ${error.message}\n`);
        res.end();
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    } else {
      res.write(`\nUnexpected error: ${error.message}`);
      res.end();
    }
  }
});

// Save lab configuration endpoint
app.post('/api/containerlab/labs/:labName/save', checkToken, async (req, res) => {
  try {
    const { serverIp } = req.body;
    const { labName } = req.params;
    const token = req.token;

    console.log('=== Save Lab Request ===');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Lab Name: ${labName}`);
    console.log(`Server IP: ${serverIp}`);
    console.log(`Token present: ${!!token}`);
    console.log(`API URL: ${getContainerlabApiUrl(serverIp)}/labs/${labName}/save`);

    const response = await axios.post(
      `${getContainerlabApiUrl(serverIp)}/labs/${labName}/save`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept': 'application/json'
        }
      }
    );

    console.log('Save operation successful');
    console.log('Response:', JSON.stringify(response.data, null, 2));

    res.json(response.data);
  } catch (error) {
    console.error('=== Save Lab Error ===');
    console.error(`Time: ${new Date().toISOString()}`);
    console.error(`Lab Name: ${labName}`);
    console.error(`Server IP: ${serverIp}`);
    console.error('Error details:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Get lab information endpoint
app.get('/api/containerlab/labs/:labName', checkToken, async (req, res) => {
  try {
    const { serverIp } = req.query;
    const { labName } = req.params;
    const token = req.token;

    const response = await axios.get(
      `${getContainerlabApiUrl(serverIp)}/labs/${labName}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error getting lab information:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// List all labs endpoint
app.get('/api/containerlab/labs', async (req, res) => {
  try {
    const { serverIp, username } = req.query;
    
    if (!serverIp) {
      return res.status(400).json({ success: false, error: 'Server IP is required' });
    }

    // Get authentication token or use existing one
    let token = tokens[serverIp];
    
    if (!token) {
      try {
        // If username is not provided, use a default
        const userToAuth = username || 'admin';
        console.log(`No existing token found for ${serverIp}, attempting to authenticate as ${userToAuth}`);
        
        const loginResponse = await axios.post(`http://${serverIp}:8080/login`, {
          username: userToAuth,
          password: 'ul678clab'  // Consider using a more secure approach
        });
        
        token = loginResponse.data.token;
        if (!token) {
          throw new Error('Authentication failed: No token received');
        }
        
        tokens[serverIp] = token;
        console.log(`New token generated for server ${serverIp}`);
      } catch (error) {
        console.error(`Authentication failed for server ${serverIp}:`, error.message);
        return res.status(401).json({
          success: false,
          error: `Authentication failed: ${error.message}`
        });
      }
    }

    // Make request to fetch labs
    try {
      const response = await axios.get(
        `${getContainerlabApiUrl(serverIp)}/labs`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'accept': 'application/json'
          }
        }
      );
  
      res.json(response.data);
    } catch (error) {
      // Check if it's a 401 (token expired) and try to regenerate token
      if (error.response && error.response.status === 401) {
        console.log(`Token expired for server ${serverIp}, regenerating...`);
        try {
          // Regenerate token
          const userToAuth = username || 'admin';
          const loginResponse = await axios.post(`http://${serverIp}:8080/login`, {
            username: userToAuth,
            password: 'ul678clab'
          });
          
          const newToken = loginResponse.data.token;
          if (!newToken) {
            throw new Error('Token regeneration failed: No token received');
          }
          
          tokens[serverIp] = newToken;
          console.log(`Token regenerated for server ${serverIp}`);
          
          // Retry the request with the new token
          const retryResponse = await axios.get(
            `${getContainerlabApiUrl(serverIp)}/labs`,
            {
              headers: {
                'Authorization': `Bearer ${newToken}`,
                'accept': 'application/json'
              }
            }
          );
          
          return res.json(retryResponse.data);
        } catch (tokenError) {
          console.error(`Failed to regenerate token for server ${serverIp}:`, tokenError.message);
          return res.status(401).json({
            success: false,
            error: `Token regeneration failed: ${tokenError.message}`
          });
        }
      }
      
      console.error(`Error listing labs from ${serverIp}:`, error.message);
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.message,
        details: error.response?.data
      });
    }
  } catch (error) {
    console.error('Unexpected error listing labs:', error.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// Deploy lab endpoint
app.post('/api/containerlab/labs/:labName/deploy', checkToken, async (req, res) => {
  try {
    const { serverIp, labData } = req.body;
    const { labName } = req.params;
    const token = req.token;

    const response = await axios.post(
      `${getContainerlabApiUrl(serverIp)}/labs/${labName}/deploy`,
      labData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error deploying lab:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Destroy lab endpoint
app.delete('/api/containerlab/labs/:labName', checkToken, async (req, res) => {
  try {
    const { serverIp } = req.body;
    const { labName } = req.params;
    const token = req.token;

    const response = await axios.delete(
      `${getContainerlabApiUrl(serverIp)}/labs/${labName}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'accept': 'application/json'
        }
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error destroying lab:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// Reconfigure lab using official containerlab API endpoint
app.post('/api/containerlab/labs/reconfigure', async (req, res) => {
  const multer = require('multer');
  const fs = require('fs');
  const path = require('path');
  const { Readable } = require('stream');
  
  // Setup multer for file handling
  const storage = multer.memoryStorage();
  const upload = multer({ storage }).single('file');
  
  try {
    // Process uploaded file
    upload(req, res, async function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
      
      const { serverIp, username } = req.body;
      
      if (!serverIp || !username || !req.file) {
        return res.status(400).json({
          success: false,
          error: 'Server IP, username and YAML file are required'
        });
      }
      
      // Set response headers for streaming
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Transfer-Encoding', 'chunked');
      
      res.write(`Starting reconfiguration process...\n`);
      res.write(`Target server: ${serverIp}\n`);
      res.write(`Username: ${username}\n`);
      res.write(`Topology file: ${req.file.originalname}\n\n`);
      
      // Get authentication token
      res.write(`Authenticating with containerlab API server...\n`);
      let token = tokens[serverIp];
      
      if (!token) {
        try {
          const loginResponse = await axios.post(`http://${serverIp}:8080/login`, {
            username,
            password: 'ul678clab'  // Consider using a more secure approach
          });
          
          token = loginResponse.data.token;
          if (!token) {
            throw new Error('Authentication failed: No token received');
          }
          
          tokens[serverIp] = token;
          res.write(`Successfully authenticated\n\n`);
        } catch (error) {
          res.write(`Authentication failed: ${error.message}\n`);
          return res.end();
        }
      } else {
        res.write(`Using cached authentication token\n\n`);
      }
      
      // Parse YAML to get lab name and convert to JSON
      try {
        const yamlContent = req.file.buffer.toString('utf8');
        const parsedYaml = yaml.load(yamlContent);
        const labName = parsedYaml.name;
        
        res.write(`Reconfiguring lab "${labName}" on containerlab server...\n\n`);
        
        // Make request to the official containerlab API
        try {
          // Prepare the request data in the expected format
          const requestData = {
            topologyContent: parsedYaml
          };
          
          // Debug what we're sending
          console.log('Sending to containerlab API for reconfiguration:', JSON.stringify(requestData, null, 2));
          res.write(`Preparing request to containerlab API...\n\n`);
          
          // Set up a progress indicator that sends updates every 5 seconds
          const progressInterval = setInterval(() => {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format
            res.write(`[${timestamp}] Reconfiguration in progress... Still working\n`);
          }, 5000);
          
          try {
            // Always use reconfigure=true for this endpoint
            const reconfigureUrl = `http://${serverIp}:8080/api/v1/labs?reconfigure=true`;
            res.write(`Using API endpoint with reconfigure flag: ${reconfigureUrl}\n`);
            
            const deployResponse = await axios({
              method: 'post',
              url: reconfigureUrl,
              data: requestData,
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              responseType: 'stream'
            });
            
            // Clear the progress indicator once we get a response
            clearInterval(progressInterval);
            
            // Stream the response back to the client
            deployResponse.data.on('data', (chunk) => {
              res.write(chunk);
            });
            
            deployResponse.data.on('end', () => {
              res.write('\n\nReconfiguration completed successfully.');
              res.end();
            });
            
            deployResponse.data.on('error', (err) => {
              // Clear the interval on stream error
              clearInterval(progressInterval);
              res.write(`\n\nStream error: ${err.message}`);
              res.end();
            });
          } catch (error) {
            // Clear the progress interval
            clearInterval(progressInterval);
            
            res.write(`\n\nError making reconfiguration request: ${error.message}\n`);
            
            // Try to extract and display the actual error from containerlab API
            if (error.response) {
              res.write(`Status: ${error.response.status}\n`);
              
              // Handle different response types
              if (error.response.data) {
                // If it's a stream, we need to read it
                if (typeof error.response.data.pipe === 'function') {
                  let errorData = '';
                  error.response.data.on('data', chunk => {
                    errorData += chunk.toString();
                  });
                  error.response.data.on('end', () => {
                    try {
                      // Try to parse as JSON
                      const parsedError = JSON.parse(errorData);
                      res.write(`\nContainerlab error: ${parsedError.error || 'Unknown error'}\n`);
                    } catch (e) {
                      // If not JSON, use as is
                      res.write(`\nContainerlab error: ${errorData}\n`);
                    }
                    res.end();
                  });
                } else {
                  // If it's already parsed JSON or string
                  if (typeof error.response.data === 'string') {
                    res.write(`\nContainerlab error: ${error.response.data}\n`);
                  } else if (error.response.data.error) {
                    res.write(`\nContainerlab error: ${error.response.data.error}\n`);
                  } else {
                    res.write(`\nContainerlab error details: ${JSON.stringify(error.response.data, null, 2)}\n`);
                  }
                  res.end();
                }
              } else {
                res.write('\nNo detailed error information available from containerlab\n');
                res.end();
              }
            } else {
              res.write('\nNo response received from containerlab API server\n');
              res.end();
            }
          }
        } catch (error) {
          res.write(`Error parsing YAML or other unexpected error: ${error.message}\n`);
          res.end();
        }
      } catch (error) {
        res.write(`Error parsing YAML: ${error.message}\n`);
        res.end();
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    } else {
      res.write(`\nUnexpected error: ${error.message}`);
      res.end();
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Containerlab API handler is running' });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ status: 'Test endpoint is working' });
});

// Global error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: err.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Containerlab API handler running on port ${PORT}`);
});