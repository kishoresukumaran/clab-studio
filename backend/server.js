/* @r1sta!23 This is the backend server side script for the Containerlab Studio. It is used to handle the API calls from the frontend. */
const express = require('express');
const { exec, spawn } = require('child_process');
const multer = require('multer');
const cors = require('cors');
const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { Client } = require('ssh2');
const http = require('http');
const os = require('os');
const pty = require('node-pty');
const config = require('./config');

const app = express();
const port = 3001;

const server = http.createServer(app);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const wss = new WebSocket.Server({ 
  server,
  path: '/ws/ssh',
  perMessageDeflate: false,
  clientTracking: true
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

const sshConfig = {
    password: config.sshPassword,
    tryKeyboard: true,
    readyTimeout: 5000
};

const getSshConfig = (username) => ({
    ...sshConfig,
    username: username
});

const resolvePath = (relativePath, basePath = '/opt') => {
    if (relativePath.startsWith('/')) {
        return relativePath;
    }
    const parts = relativePath.split('/');
    const baseParts = basePath.split('/');
    
    for (const part of parts) {
        if (part === '..') {
            baseParts.pop();
        } else if (part !== '.') {
            baseParts.push(part);
        }
    }
    
    return baseParts.join('/');
};

app.get('/api/containerlab/inspect', (req, res) => {
    exec('clab inspect --all --format json', (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }

        try {
            const data = JSON.parse(stdout);
            const topologies = [];
            const labsByFile = {};

            data.containers.forEach(container => {
                const fullLabPath = resolvePath(container.labPath);
                
                if (!labsByFile[fullLabPath]) {
                    labsByFile[fullLabPath] = {
                        labPath: fullLabPath,
                        lab_name: container.lab_name,
                        lab_owner: container.owner,
                        nodes: []
                    };
                    topologies.push(labsByFile[fullLabPath]);
                }
                labsByFile[fullLabPath].nodes.push({
                    ...container,
                    labPath: fullLabPath
                });
            });

            res.json(topologies);
        } catch (parseError) {
            res.status(500).json({
                error: 'Failed to parse JSON output',
                details: parseError.message,
                rawOutput: stdout
            });
        }
    });
});

app.post('/api/containerlab/deploy', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { serverIp, username } = req.body;
        if (!serverIp) {
            return res.status(400).json({ error: 'Server IP is required' });
        }
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        // Extract the topology name from the filename (remove .yaml extension)
        const topologyName = req.file.originalname.replace('.yaml', '');
        const userDir = `/home/clab_nfs_share/containerlab_topologies/${username}/${topologyName}`;
        const remoteFilePath = `${userDir}/${req.file.originalname}`;

        try {
            res.write(`Ensuring containerlab_topologies directory exists at ${userDir}...\n`);
            await ssh.execCommand(`mkdir -p ${userDir}`, {
                cwd: '/'
            });

            res.write(`Uploading file to ${remoteFilePath}...\n`);
            await ssh.putFile(req.file.path, remoteFilePath);
            res.write('File uploaded successfully\n');

            res.write('Executing containerlab deploy command...\n');
            const deployCommand = `clab deploy --topo ${remoteFilePath}`;
            const result = await ssh.execCommand(deployCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            fs.unlinkSync(req.file.path);
            
            if (result.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology deployed successfully',
                    filePath: remoteFilePath
                }));
            } else {
                res.write(`Operation failed: ${result.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Deployment failed',
                    error: result.stderr
                }));
            }

        } catch (error) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Deployment failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/containerlab/destroy', async (req, res) => {
    try {
        const { serverIp, topoFile, username } = req.body;
        console.log('Destroy request:', req.body);
        
        if (!serverIp || !topoFile || !username) {
            return res.status(400).json({ 
                error: 'Server IP, topology file path, and username are required' 
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        try {
            res.write('Executing containerlab destroy command...\n');
            const absoluteTopoPath = topoFile;
            const destroyCommand = `clab destroy --topo ${absoluteTopoPath}`;
            const result = await ssh.execCommand(destroyCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            if (result.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology destroyed successfully'
                }));
            } else {
                res.write(`Operation failed: ${result.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Destroy operation failed',
                    error: result.stderr
                }));
            }

        } catch (error) {
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Destroy operation failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.post('/api/containerlab/reconfigure', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { serverIp, username } = req.body;
        if (!serverIp) {
            return res.status(400).json({ error: 'Server IP is required' });
        }
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        // Extract the topology name from the filename (remove .yaml extension)
        const topologyName = req.file.originalname.replace('.yaml', '');
        const userDir = `/home/clab_nfs_share/containerlab_topologies/${username}/${topologyName}`;
        const remoteFilePath = `${userDir}/${req.file.originalname}`;

        try {
            res.write(`Ensuring containerlab_topologies directory exists at ${userDir}...\n`);
            await ssh.execCommand(`mkdir -p ${userDir}`, {
                cwd: '/'
            });

            res.write(`Uploading updated file to ${remoteFilePath}...\n`);
            await ssh.putFile(req.file.path, remoteFilePath);
            res.write('File uploaded successfully\n');

            res.write('Executing containerlab reconfigure command...\n');
            const reconfigureCommand = `clab deploy --topo ${remoteFilePath} --reconfigure`;
            const result = await ssh.execCommand(reconfigureCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            fs.unlinkSync(req.file.path);
            
            if (result.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology reconfigured successfully',
                    filePath: remoteFilePath
                }));
            } else {
                res.write(`Operation failed: ${result.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Reconfigure operation failed',
                    error: result.stderr
                }));
            }

        } catch (error) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Reconfigure operation failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.post('/api/containerlab/reconfigure-existing', async (req, res) => {
    try {
        const { serverIp, topoFile, username } = req.body;
        console.log('Reconfigure existing request:', req.body);

        if (!serverIp || !topoFile || !username) {
            return res.status(400).json({
                error: 'Server IP, topology file path, and username are required'
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        try {
            res.write('Executing containerlab reconfigure command...\n');
            const absoluteTopoPath = topoFile;
            const reconfigureCommand = `clab deploy --topo ${absoluteTopoPath} --reconfigure`;
            const result = await ssh.execCommand(reconfigureCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            if (result.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology reconfigured successfully'
                }));
            } else {
                res.write(`Operation failed: ${result.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Reconfigure operation failed',
                    error: result.stderr
                }));
            }

        } catch (error) {
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Reconfigure operation failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.post('/api/containerlab/save', async (req, res) => {
    try {
        const { serverIp, topoFile, username } = req.body;
        console.log('Save lab request:', req.body);

        if (!serverIp || !topoFile || !username) {
            return res.status(400).json({ 
                error: 'Server IP and topology file path are required' 
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        try {
            res.write('Executing containerlab save command...\n');
            const absoluteTopoPath = resolvePath(topoFile);
            const saveCommand = `clab save -t ${absoluteTopoPath}`;
            const result = await ssh.execCommand(saveCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            if (result.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology saved successfully'
                }));
            } else {
                res.write(`Operation failed: ${result.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Save operation failed',
                    error: result.stderr
                }));
            }

        } catch (error) {
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Save operation failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.post('/api/containerlab/stop', async (req, res) => {
    try {
        const { serverIp, topologyName, username } = req.body;
        console.log('Stop request:', req.body);

        if (!serverIp || !topologyName || !username) {
            return res.status(400).json({
                error: 'Server IP, topology name, and username are required'
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        try {
            // First, find container IDs for the topology
            res.write('Finding containers for topology...\n');
            const listCommand = `docker ps -q --filter "label=containerlab=${topologyName}"`;
            const listResult = await ssh.execCommand(listCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            const containerIds = listResult.stdout.trim();
            if (!containerIds) {
                res.write('No running containers found for this topology\n');
                res.end(JSON.stringify({
                    success: false,
                    message: 'Stop operation failed',
                    error: 'No running containers found for this topology'
                }));
                return;
            }

            // Stop the found containers
            res.write('Stopping containers...\n');
            const stopCommand = `docker stop ${containerIds.split('\n').join(' ')}`;
            const result = await ssh.execCommand(stopCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            if (result.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology stopped successfully'
                }));
            } else {
                res.write(`Operation failed: ${result.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Stop operation failed',
                    error: result.stderr
                }));
            }

        } catch (error) {
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Stop operation failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.post('/api/containerlab/redeploy', async (req, res) => {
    try {
        const { serverIp, topoFile, username } = req.body;
        console.log('Redeploy request:', req.body);

        if (!serverIp || !topoFile || !username) {
            return res.status(400).json({
                error: 'Server IP, topology file path, and username are required'
            });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const ssh = new NodeSSH();

        try {
            res.write(`Connecting to server as ${username}...\n`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });
            res.write('Connected successfully\n');
        } catch (error) {
            res.write(`Failed to connect to server: ${error.message}\n`);
            res.end();
            return;
        }

        try {
            // Step 1: Destroy the topology
            res.write('Step 1: Destroying topology...\n');
            const destroyCommand = `clab destroy --topo ${topoFile}`;
            const destroyResult = await ssh.execCommand(destroyCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            if (destroyResult.code !== 0) {
                res.write(`Destroy step failed: ${destroyResult.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Redeploy failed during destroy step',
                    error: destroyResult.stderr
                }));
                return;
            }

            res.write('Destroy completed. Proceeding to deploy...\n');

            // Step 2: Deploy the topology
            res.write('Step 2: Deploying topology...\n');
            const deployCommand = `clab deploy --topo ${topoFile}`;
            const deployResult = await ssh.execCommand(deployCommand, {
                cwd: '/',
                onStdout: (chunk) => {
                    res.write(`stdout: ${chunk.toString()}\n`);
                },
                onStderr: (chunk) => {
                    res.write(`stderr: ${chunk.toString()}\n`);
                }
            });

            if (deployResult.code === 0) {
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Topology redeployed successfully'
                }));
            } else {
                res.write(`Deploy step failed: ${deployResult.stderr}\n`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Redeploy failed during deploy step',
                    error: deployResult.stderr
                }));
            }

        } catch (error) {
            res.write(`Operation failed: ${error.message}\n`);
            res.end(JSON.stringify({
                error: `Redeploy operation failed: ${error.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        res.write(`Server error: ${error.message}\n`);
        res.end(JSON.stringify({
            error: `Server error: ${error.message}`
        }));
    }
});

app.get('/api/ports/free', async (req, res) => {
    try {
        const { serverIp, username } = req.query;

        if (!serverIp || !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(serverIp)) {
            return res.status(400).json({
                success: false,
                error: 'Valid IPv4 address required'
            });
        }

        if (!username) {
            return res.status(400).json({
                success: false,
                error: 'Username is required'
            });
        }

        const ssh = new NodeSSH();

        try {
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp
            });

            const findPortsScript = `
                #!/bin/bash
                used_ports=$(ss -tuln | awk '{print $5}' | awk -F: '{print $NF}' | sort -nu)
                comm -23 <(seq 1024 65535 | sort) <(echo "$used_ports") | tr '\n' ' '
            `;

            const result = await ssh.execCommand(findPortsScript, {
                execOptions: { timeout: 10000 }
            });
            
            if (result.code === 0) {
                const freePorts = result.stdout
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(Number);
                    
                res.json({
                    success: true,
                    freePorts: freePorts,
                    count: freePorts.length
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: `Port scan failed: ${result.stderr || 'Unknown error'}`
                });
            }

        } catch (error) {
            res.status(500).json({
                success: false,
                error: `SSH connection failed: ${error.message}`
            });
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Server error: ${error.message}`
        });
    }
});

app.get('/api/files/list', async (req, res) => {
  try {
    const { path, serverIp, username } = req.query;
    
    if (!serverIp) {
      return res.status(400).json({ success: false, error: 'Server IP is required' });
    }
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    
    console.log(`Listing directory for user: ${username}`);

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });

    const { stdout } = await ssh.execCommand(`ls -la ${path}`, { cwd: '/' });
    
    const contents = stdout.split('\n')
      .slice(1)
      .filter(line => line.trim() && !line.endsWith('.') && !line.endsWith('..'))
      .map(line => {
        const parts = line.split(/\s+/);
        const name = parts.slice(8).join(' ');
        const isDirectory = line.startsWith('d');
        return {
          name,
          type: isDirectory ? 'directory' : 'file',
          path: `${path}/${name}`
        };
      });

    await ssh.dispose();
    res.json({ success: true, contents });
  } catch (error) {
    console.error('Error listing directory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/files/read', async (req, res) => {
  try {
    const { path, serverIp, username } = req.query;
    
    if (!serverIp) {
      return res.status(400).json({ success: false, error: 'Server IP is required' });
    }
    
    if (!username) {
      return res.status(400).json({ success: false, error: 'Username is required' });
    }
    
    console.log(`Reading file for user: ${username}`);

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });

    const { stdout } = await ssh.execCommand(`cat ${path}`, { cwd: '/' });
    
    await ssh.dispose();
    res.json({ success: true, content: stdout });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add this new endpoint for saving files
app.post('/api/files/save', upload.single('file'), async (req, res) => {
  const { serverIp, username, path } = req.body;
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ success: false, error: 'No file provided' });
  }
  
  if (!username) {
    return res.status(400).json({ success: false, error: 'Username is required' });
  }
  
  try {
    console.log(`Saving file for user: ${username}`);
    console.log(`Target path: ${path}`);

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });
  
    // Use the path provided by the user
    const targetPath = `${path}/${file.originalname}`;
    
    // No need to create a separate directory - use the path selected by the user
    console.log(`Saving file to: ${targetPath}`);
    
    // Upload the file
    await ssh.putFile(file.path, targetPath);
  
    // Clean up the uploaded file
    await fs.promises.unlink(file.path);
  
    ssh.dispose();
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving file:', error);
    // Clean up the uploaded file in case of error
    if (file.path && fs.existsSync(file.path)) {
      await fs.promises.unlink(file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Upload a file to a server directory
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  const { serverIp, targetDirectory, username } = req.body;
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ success: false, error: 'No file provided' });
  }
  
  if (!serverIp || !targetDirectory) {
    return res.status(400).json({ success: false, error: 'Server IP and target directory are required' });
  }
  
  try {
    console.log(`Uploading file for user: ${username}`);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });
    
    // Ensure target directory exists
    console.log(`Ensuring directory exists: ${targetDirectory}`);
    await ssh.execCommand(`mkdir -p "${targetDirectory}"`);
    
    // Upload the file
    const targetPath = `${targetDirectory}/${file.originalname}`;
    console.log(`Uploading file to: ${targetPath}`);
    await ssh.putFile(file.path, targetPath);
  
    // Clean up the uploaded file
    await fs.promises.unlink(file.path);
    
    console.log('File uploaded successfully');
  
    ssh.dispose();
    res.json({ 
      success: true, 
      message: 'File uploaded successfully',
      path: targetPath 
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    // Clean up the uploaded file in case of error
    if (file.path && fs.existsSync(file.path)) {
      await fs.promises.unlink(file.path);
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a file or directory
app.delete('/api/files/delete', async (req, res) => {
  const { serverIp, path, isDirectory, username } = req.body;
  
  if (!serverIp || !path) {
    return res.status(400).json({ success: false, error: 'Server IP and path are required' });
  }
  
  try {
    console.log(`Deleting ${isDirectory ? 'directory' : 'file'} for user: ${username}`);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });
    
    // Delete the file or directory
    console.log(`Attempting to delete ${isDirectory ? 'directory' : 'file'}: ${path}`);
    const command = isDirectory ? `rm -rf "${path}"` : `rm "${path}"`;
    const result = await ssh.execCommand(command);
    
    if (result.stderr) {
      console.log('Deletion failed with error:', result.stderr);
      throw new Error(result.stderr);
    }
    
    console.log('Deletion completed successfully');
    
    ssh.dispose();
    res.json({ 
      success: true, 
      message: `${isDirectory ? 'Directory' : 'File'} deleted successfully` 
    });
  } catch (error) {
    console.error('Error deleting file/directory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new directory
app.post('/api/files/createDirectory', async (req, res) => {
  const { serverIp, path, directoryName, username } = req.body;
  
  if (!serverIp || !path || !directoryName) {
    return res.status(400).json({ 
      success: false, 
      error: 'Server IP, path, and directory name are required' 
    });
  }
  
  try {
    console.log(`Creating directory for user: ${username}`);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });
    
    // Get user info to verify connection
    const whoamiResult = await ssh.execCommand('whoami');
    console.log('Connected as user:', whoamiResult.stdout);
    
    // Create the directory
    const newDirectoryPath = `${path}/${directoryName}`;
    console.log('Attempting to create directory:', newDirectoryPath);
    
    const result = await ssh.execCommand(`mkdir -p "${newDirectoryPath}"`);
    
    if (result.stderr) {
      console.log('Directory creation failed with error:', result.stderr);
      throw new Error(result.stderr);
    }
    
    console.log('Directory created successfully');
    
    ssh.dispose();
    res.json({ 
      success: true, 
      message: 'Directory created successfully',
      path: newDirectoryPath
    });
  } catch (error) {
    console.error('Error creating directory:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new empty file
app.post('/api/files/createFile', async (req, res) => {
  const { serverIp, path, fileName, content = '', username } = req.body;
  
  if (!serverIp || !path || !fileName) {
    return res.status(400).json({ 
      success: false, 
      error: 'Server IP, path, and file name are required' 
    });
  }
  
  try {
    console.log(`Creating file for user: ${username}`);

    if (!username) {
      return res.status(400).json({
        success: false,
        error: 'Username is required'
      });
    }

    const ssh = new NodeSSH();

    console.log(`Connecting as user: ${username}`);
    await ssh.connect({
      host: serverIp,
      ...getSshConfig(username)
    });
    
    // Create the file
    const newFilePath = `${path}/${fileName}`;
    console.log('Attempting to create file:', newFilePath);
    
    // Write content to file
    const writeCommand = `cat > "${newFilePath}" << 'EOF'
${content}
EOF`;
    
    const result = await ssh.execCommand(writeCommand);
    
    if (result.stderr) {
      console.log('File creation failed with error:', result.stderr);
      throw new Error(result.stderr);
    }
    
    console.log('File created successfully');
    
    ssh.dispose();
    res.json({ 
      success: true, 
      message: 'File created successfully',
      path: newFilePath
    });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add this new endpoint for getting system metrics
app.get('/api/system/metrics', async (req, res) => {
  try {
    // Get CPU usage
    const cpus = os.cpus();
    const totalCpuTime = cpus.reduce((acc, cpu) => {
      return acc + Object.values(cpu.times).reduce((sum, time) => sum + time, 0);
    }, 0);
    const idleCpuTime = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const cpuUsage = ((totalCpuTime - idleCpuTime) / totalCpuTime) * 100;

    // Get memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;
    
    // Format memory values for human-readable display
    const formatMemory = (bytes) => {
      const gigabytes = bytes / (1024 * 1024 * 1024);
      return `${gigabytes.toFixed(2)} GB`;
    };
    
    const availableMemory = {
      free: formatMemory(freeMemory),
      total: formatMemory(totalMemory),
      formatted: `${formatMemory(freeMemory)} / ${formatMemory(totalMemory)}`
    };

    res.json({
      success: true,
      metrics: {
        cpu: Math.round(cpuUsage),
        memory: Math.round(memoryUsage),
        availableMemory: availableMemory
      }
    });
  } catch (error) {
    console.error('Error getting system metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a Linux system user on the server
app.post('/api/system/createUser', async (req, res) => {
  try {
    const { username, adminUsername } = req.body;

    if (!username || !adminUsername) {
      return res.status(400).json({
        success: false,
        error: 'Username and adminUsername are required'
      });
    }

    // Validate username format to prevent command injection
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format. Use lowercase letters, digits, hyphens, and underscores only.'
      });
    }

    console.log(`Creating system user "${username}" via admin "${adminUsername}"`);

    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: config.serverIp,
        ...getSshConfig(adminUsername)
      });
    } catch (error) {
      console.error('SSH connection failed:', error);
      return res.status(500).json({
        success: false,
        error: `SSH connection failed: ${error.message}`
      });
    }

    try {
      // Step 1: Create the user with home directory and bash shell
      const createUserResult = await ssh.execCommand(
        `echo '${config.sshPassword}' | sudo -S useradd -m -s /bin/bash ${username}`
      );
      if (createUserResult.code !== 0 && !createUserResult.stderr.includes('already exists')) {
        throw new Error(`Failed to create user: ${createUserResult.stderr}`);
      }

      // Step 2: Set the user's password
      const setPasswordResult = await ssh.execCommand(
        `echo '${config.sshPassword}' | sudo -S bash -c "echo '${username}:${config.sshPassword}' | chpasswd"`
      );
      if (setPasswordResult.code !== 0) {
        throw new Error(`Failed to set password: ${setPasswordResult.stderr}`);
      }

      // Step 3: Add user to required groups (matching existing user kishore's groups)
      const addGroupsResult = await ssh.execCommand(
        `echo '${config.sshPassword}' | sudo -S usermod -aG adm,cdrom,sudo,dip,plugdev,users,lpadmin,clab_admins,docker ${username}`
      );
      if (addGroupsResult.code !== 0) {
        throw new Error(`Failed to add groups: ${addGroupsResult.stderr}`);
      }

      // Step 4: Restart clab-api-server so it picks up the new user
      // Use Docker Engine API via socket since docker CLI is not in this container
      console.log('Restarting clab-api-server to register new user...');
      exec("curl -s --unix-socket /var/run/docker.sock -X POST http://localhost/containers/clab-api-server/restart", (err, stdout, stderr) => {
        if (err) {
          console.error('Warning: Failed to restart clab-api-server:', stderr);
        } else {
          console.log('clab-api-server restarted successfully');
        }
      });

      console.log(`System user "${username}" created successfully`);
      res.json({
        success: true,
        message: `System user "${username}" created successfully`
      });

    } catch (error) {
      console.error('Error creating system user:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      ssh.dispose();
    }

  } catch (error) {
    console.error('Server error during user creation:', error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

// Delete a Linux system user from the server
app.post('/api/system/deleteUser', async (req, res) => {
  try {
    const { username, adminUsername } = req.body;

    if (!username || !adminUsername) {
      return res.status(400).json({
        success: false,
        error: 'Username and adminUsername are required'
      });
    }

    // Validate username format to prevent command injection
    if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid username format.'
      });
    }

    console.log(`Deleting system user "${username}" via admin "${adminUsername}"`);

    const ssh = new NodeSSH();

    try {
      await ssh.connect({
        host: config.serverIp,
        ...getSshConfig(adminUsername)
      });
    } catch (error) {
      console.error('SSH connection failed:', error);
      return res.status(500).json({
        success: false,
        error: `SSH connection failed: ${error.message}`
      });
    }

    try {
      // Delete the user and their home directory
      const deleteResult = await ssh.execCommand(
        `echo '${config.sshPassword}' | sudo -S userdel -r ${username}`
      );

      if (deleteResult.code !== 0) {
        // If user doesn't exist on the system, treat as success
        if (deleteResult.stderr.includes('does not exist')) {
          console.log(`System user "${username}" does not exist on server, skipping`);
          return res.json({
            success: true,
            message: `System user "${username}" did not exist on server (already removed)`
          });
        }
        throw new Error(`Failed to delete user: ${deleteResult.stderr}`);
      }

      console.log(`System user "${username}" deleted successfully`);
      res.json({
        success: true,
        message: `System user "${username}" deleted successfully`
      });

    } catch (error) {
      console.error('Error deleting system user:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    } finally {
      ssh.dispose();
    }

  } catch (error) {
    console.error('Server error during user deletion:', error);
    res.status(500).json({
      success: false,
      error: `Server error: ${error.message}`
    });
  }
});

app.post('/api/files/copyPaste', async (req, res) => {
    try {
        const { sourceServerIp, sourcePath, isDirectory, destinationServerIp, destinationPath, username } = req.body;

        if (!sourceServerIp || !sourcePath || !destinationServerIp || !destinationPath || !username) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const ssh = new NodeSSH();
        try {
            await ssh.connect({
                ...getSshConfig(username),
                host: sourceServerIp
            });
        } catch (error) {
            return res.status(500).json({ error: `Failed to connect to server: ${error.message}` });
        }

        let command;
        // Extract the base name of the source item to append to the destination path
        const itemName = path.basename(sourcePath);
        const targetPath = path.posix.join(destinationPath, itemName); // Use posix.join for consistent path handling

        if (isDirectory) {
            command = `cp -r "${sourcePath}" "${targetPath}"`;
        } else {
            command = `cp "${sourcePath}" "${targetPath}"`;
        }

        try {
            const result = await ssh.execCommand(command, { cwd: '/' });

            if (result.code === 0) {
                res.json({ success: true, message: 'Item copied successfully', newPath: targetPath });
            } else {
                res.status(500).json({ success: false, error: result.stderr || 'Failed to copy item' });
            }
        } catch (error) {
            res.status(500).json({ error: `Error executing copy command: ${error.message}` });
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        console.error('Server error during copy/paste:', error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Rename a file or directory
app.post('/api/files/rename', async (req, res) => {
    const { serverIp, oldPath, newPath, username } = req.body;

    if (!serverIp || !oldPath || !newPath || !username) {
        return res.status(400).json({ success: false, error: 'Server IP, old path, new path, and username are required' });
    }

    try {
        const ssh = new NodeSSH();
        await ssh.connect({
            ...getSshConfig(username),
            host: serverIp
        });

        const command = `mv "${oldPath}" "${newPath}"`;
        const result = await ssh.execCommand(command);

        if (result.stderr) {
            throw new Error(result.stderr);
        }

        ssh.dispose();
        res.json({ success: true, message: 'Item renamed successfully' });

    } catch (error) {
        console.error('Error renaming item:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add a new API endpoint for cloning a git repository
app.post('/api/git/clone', async (req, res) => {
  try {
    const { gitRepoUrl, username } = req.body;
    
    if (!gitRepoUrl || !username) {
      return res.status(400).json({ 
        success: false, 
        error: 'Git repository URL and username are required' 
      });
    }

    // Get the server IP from config
    const serverIp = config.serverIp;
    
    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    // Helper function to write logs
    const log = (message) => {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS format
      res.write(`[${timestamp}] ${message}\n`);
    };

    log(`Starting git clone operation for ${gitRepoUrl}...`);
    log(`Target server: ${serverIp}`);
    log(`Username: ${username}`);

    // Get the repository name from the URL
    const repoName = gitRepoUrl.split('/').pop().replace('.git', '');
    const targetDir = `/home/clab_nfs_share/containerlab_topologies/${username}/${repoName}`;
    
    log(`Repository will be cloned to: ${targetDir}`);

    const ssh = new NodeSSH();
    
    try {
      log(`Connecting to server as ${username}...`);
      await ssh.connect({
        ...getSshConfig(username),
        host: serverIp,
        readyTimeout: 10000
      });
      log('Connected successfully');

      // Check if directory already exists
      log('Checking if repository directory already exists...');
      const checkDirResult = await ssh.execCommand(`[ -d "${targetDir}" ] && echo "exists" || echo "not exists"`, { cwd: '/' });
      
      if (checkDirResult.stdout.trim() === 'exists') {
        log(`Repository directory already exists. Removing existing directory...`);
        await ssh.execCommand(`rm -rf "${targetDir}"`, { cwd: '/' });
        log(`Existing directory removed`);
      }

      // Ensure parent directory exists
      const parentDir = `/home/clab_nfs_share/containerlab_topologies/${username}`;
      await ssh.execCommand(`mkdir -p "${parentDir}"`, { cwd: '/' });
      log(`Cloning repository ${gitRepoUrl} to ${targetDir}...`);

      // Clone the repository
      const cloneResult = await ssh.execCommand(`git clone ${gitRepoUrl} "${targetDir}"`, {
        cwd: '/',
        onStdout: (chunk) => {
          log(chunk.toString().trim());
        },
        onStderr: (chunk) => {
          const stderr = chunk.toString().trim();
          if (stderr && !stderr.includes('Cloning into')) {
            log(`WARNING: ${stderr}`);
          } else if (stderr) {
            log(stderr);
          }
        }
      });

      if (cloneResult.code !== 0) {
        throw new Error(`Git clone failed: ${cloneResult.stderr}`);
      }

      log('Repository cloned successfully');
      log('Operation completed successfully');
      
      // Send the final response
      res.end();
      
    } catch (error) {
      log(`ERROR: ${error.message}`);
      res.end();
    } finally {
      if (ssh) {
        ssh.dispose();
      }
    }
    
  } catch (error) {
    console.error('Git clone operation error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    } else {
      res.write(`\nERROR: ${error.message}\n`);
      res.end();
    }
  }
});

// Git repository scan endpoint - clones repo and lists all topology YAML files
app.post('/api/containerlab/scan-git', async (req, res) => {
    try {
        const { gitRepoUrl, username } = req.body;

        if (!gitRepoUrl || !username) {
            return res.status(400).json({
                success: false,
                error: 'Git repository URL and username are required'
            });
        }

        const serverIp = config.serverIp;
        const repoName = gitRepoUrl.split('/').pop().replace('.git', '');
        const deployTimestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').split('.')[0];
        const uniqueRepoName = `${repoName}-${deployTimestamp}`;
        const userDir = `${config.baseTopologyDirectory}/${username}/${uniqueRepoName}`;

        const ssh = new NodeSSH();

        try {
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp,
                readyTimeout: 10000
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: `Failed to connect to server: ${error.message}`
            });
        }

        try {
            // Create directories
            const parentDir = `${config.baseTopologyDirectory}/${username}`;
            await ssh.execCommand(`mkdir -p ${parentDir}`, { cwd: '/' });
            await ssh.execCommand(`mkdir -p ${userDir}`, { cwd: '/' });

            // Clone the repository
            const cloneResult = await ssh.execCommand(`git clone ${gitRepoUrl} .`, { cwd: userDir });

            if (cloneResult.code !== 0) {
                // Cleanup on clone failure
                await ssh.execCommand(`rm -rf ${userDir}`, { cwd: '/' });
                return res.status(500).json({
                    success: false,
                    error: `Failed to clone repository: ${cloneResult.stderr}`
                });
            }

            // Find ALL yaml/yml files
            const findResult = await ssh.execCommand(
                `find . -maxdepth 3 -type f \\( -name "*.yaml" -o -name "*.yml" \\) | sort`,
                { cwd: userDir }
            );

            const allFiles = findResult.stdout.trim().split('\n').filter(f => f.length > 0);

            if (allFiles.length === 0) {
                return res.json({
                    success: false,
                    error: 'No topology YAML files found in the repository',
                    clonedDir: userDir
                });
            }

            return res.json({
                success: true,
                clonedDir: userDir,
                repoName: repoName,
                topoFiles: allFiles
            });

        } catch (error) {
            console.error('Git scan error:', error);
            return res.status(500).json({
                success: false,
                error: error.message
            });
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        console.error('Git scan endpoint error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cleanup endpoint for removing cloned git directories when user cancels
app.post('/api/containerlab/cleanup-git-scan', async (req, res) => {
    try {
        const { clonedDir, username } = req.body;

        if (!clonedDir || !username) {
            return res.status(400).json({
                success: false,
                error: 'clonedDir and username are required'
            });
        }

        // Security: validate the clonedDir is within the expected base path
        const expectedPrefix = `${config.baseTopologyDirectory}/${username}/`;
        if (!clonedDir.startsWith(expectedPrefix)) {
            return res.status(403).json({
                success: false,
                error: 'Invalid directory path'
            });
        }

        const ssh = new NodeSSH();
        await ssh.connect({
            ...getSshConfig(username),
            host: config.serverIp,
            readyTimeout: 10000
        });

        await ssh.execCommand(`rm -rf "${clonedDir}"`, { cwd: '/' });
        ssh.dispose();

        return res.json({ success: true });

    } catch (error) {
        console.error('Cleanup error:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Git repository deployment endpoint - clones repo, finds YAML, renames topology, deploys
app.post('/api/containerlab/deploy-git', async (req, res) => {
    try {
        const { gitRepoUrl, username, clonedDir, selectedTopoFile } = req.body;

        if (!gitRepoUrl || !username) {
            return res.status(400).json({
                error: 'Git repository URL and username are required'
            });
        }

        const serverIp = config.serverIp;

        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Transfer-Encoding', 'chunked');

        const log = (message) => {
            const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
            res.write(`[${timestamp}] ${message}\n`);
        };

        const repoName = gitRepoUrl.split('/').pop().replace('.git', '');
        const usePreCloned = clonedDir && selectedTopoFile;

        let userDir;
        let yamlFile;
        const deployTimestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').split('.')[0];

        if (usePreCloned) {
            userDir = clonedDir;
            yamlFile = selectedTopoFile;
            log(`Git Repository Deployment: ${repoName}`);
            log(`Using pre-cloned directory: ${userDir}`);
            log(`Selected topology file: ${yamlFile}`);
            log(`Target server: ${serverIp}`);
        } else {
            const uniqueRepoName = `${repoName}-${deployTimestamp}`;
            userDir = `${config.baseTopologyDirectory}/${username}/${uniqueRepoName}`;

            log(`Git Repository Deployment: ${repoName}`);
            log(`Unique deployment name: ${uniqueRepoName}`);
            log(`Repository: ${gitRepoUrl}`);
            log(`Target directory: ${userDir}`);
            log(`Target server: ${serverIp}`);
        }

        const ssh = new NodeSSH();

        try {
            log(`Connecting to server as ${username}...`);
            await ssh.connect({
                ...getSshConfig(username),
                host: serverIp,
                readyTimeout: 10000
            });
            log('Connected successfully');
        } catch (error) {
            log(`Failed to connect to server: ${error.message}`);
            res.end();
            return;
        }

        try {
            if (!usePreCloned) {
                // Ensure parent directory exists
                const parentDir = `${config.baseTopologyDirectory}/${username}`;
                await ssh.execCommand(`mkdir -p ${parentDir}`, { cwd: '/' });
                await ssh.execCommand(`mkdir -p ${userDir}`, { cwd: '/' });
                log(`Created deployment directory: ${userDir}`);

                // Step 1: Clone the git repository
                log(`Cloning repository ${gitRepoUrl}...`);
                const cloneResult = await ssh.execCommand(`git clone ${gitRepoUrl} .`, {
                    cwd: userDir,
                    onStdout: (chunk) => {
                        log(`git: ${chunk.toString().trim()}`);
                    },
                    onStderr: (chunk) => {
                        const stderr = chunk.toString().trim();
                        if (stderr) log(`git: ${stderr}`);
                    }
                });

                if (cloneResult.code !== 0) {
                    throw new Error(`Failed to clone repository: ${cloneResult.stderr}`);
                }
                log('Repository cloned successfully');

                // Step 2: Find YAML file
                log('Looking for containerlab YAML files...');
                const findResult = await ssh.execCommand(
                    `find . -maxdepth 2 -name "*.yaml" -o -name "*.yml" | head -1`,
                    { cwd: userDir }
                );

                if (findResult.code !== 0 || !findResult.stdout.trim()) {
                    throw new Error('No YAML files found in the repository');
                }

                yamlFile = findResult.stdout.trim();
            }

            log(`Using topology file: ${yamlFile}`);

            // Step 3: Modify topology name for uniqueness
            log('Modifying topology name for unique deployment...');
            const uniqueTopologyName = `${username}-${repoName}-${deployTimestamp}`;

            const readResult = await ssh.execCommand(`cat ${yamlFile}`, { cwd: userDir });
            if (readResult.code !== 0) {
                throw new Error(`Failed to read YAML file: ${readResult.stderr}`);
            }

            let yamlContent = readResult.stdout;
            yamlContent = yamlContent.replace(/^(\s*name\s*:\s*).+$/m, `$1${uniqueTopologyName}`);

            const modifiedYamlFile = `${yamlFile}.modified`;
            const writeCommand = `cat > ${modifiedYamlFile} << 'YAML_EOF'\n${yamlContent}\nYAML_EOF`;
            const writeResult = await ssh.execCommand(writeCommand, { cwd: userDir });

            if (writeResult.code !== 0) {
                throw new Error(`Failed to write modified YAML: ${writeResult.stderr}`);
            }
            log(`Modified topology name to: ${uniqueTopologyName}`);

            // Step 4: Deploy
            log(`Deploying topology using ${modifiedYamlFile}...`);
            log('');
            const deployCommand = `clab deploy --topo ${modifiedYamlFile}`;
            const result = await ssh.execCommand(deployCommand, {
                cwd: userDir,
                onStdout: (chunk) => {
                    res.write(chunk.toString());
                },
                onStderr: (chunk) => {
                    res.write(chunk.toString());
                }
            });

            if (result.code === 0) {
                log('Git deployment completed successfully');
                res.write('Operation completed successfully\n');
                res.end(JSON.stringify({
                    success: true,
                    message: 'Git deployment completed successfully',
                    repoName: repoName,
                    uniqueTopologyName: uniqueTopologyName
                }));
            } else {
                log(`Deployment failed: ${result.stderr}`);
                res.end(JSON.stringify({
                    success: false,
                    message: 'Git deployment failed',
                    error: result.stderr
                }));
            }

        } catch (deployError) {
            console.error('Git deployment error:', deployError);
            log(`Git deployment failed: ${deployError.message}`);
            res.end(JSON.stringify({
                error: `Git deployment failed: ${deployError.message}`
            }));
        } finally {
            ssh.dispose();
        }

    } catch (error) {
        console.error('Git deploy endpoint error:', error);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
        res.write(`Server error: ${error.message}\n`);
        res.end();
    }
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection established');
  let sshClient = null;
  let sshStream = null;
  let dockerProcess = null;

  ws.on('message', async (message) => {
    if (sshStream) {
      sshStream.write(message.toString());
      return;
    } else if (dockerProcess) {
        dockerProcess.write(message.toString());
        return;
    }

    try {
      const data = JSON.parse(message);
      console.log('Received connection request:', data);
      const { nodeName, nodeIp, username, nodeKind } = data;

      if (nodeKind === 'linux') {
          console.log(`Attempting docker exec to ${nodeName} with pty`);
          dockerProcess = pty.spawn('docker', ['exec', '-it', nodeName, 'sh'], {
              name: 'xterm-256color',
              cols: data.cols || 80,
              rows: data.rows || 24,
              cwd: process.env.HOME,
              env: process.env
          });

          dockerProcess.onData((data) => {
              ws.send(data);
          });

          dockerProcess.onExit(({ exitCode, signal }) => {
              console.log(`Docker exec pty process exited with code ${exitCode} and signal ${signal}`);
              ws.send('\r\n\x1b[31mConnection closed\x1b[0m');
              ws.close();
          });

          dockerProcess.on('error', (err) => {
              console.error('Docker exec pty process error:', err);
              ws.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
              ws.close();
          });

      } else if (nodeKind === 'sonic-vm') {
          console.log(`Attempting SSH connection to sonic-vm node ${nodeName}`);
          // For sonic-vm, we'll use the node name directly with ssh command
          dockerProcess = pty.spawn('ssh', ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', 'admin@' + nodeName], {
              name: 'xterm-256color',
              cols: data.cols || 80,
              rows: data.rows || 24,
              cwd: process.env.HOME,
              env: process.env
          });

          dockerProcess.onData((data) => {
              ws.send(data);
          });

          dockerProcess.onExit(({ exitCode, signal }) => {
              console.log(`SSH to sonic-vm process exited with code ${exitCode} and signal ${signal}`);
              ws.send('\r\n\x1b[31mConnection closed\x1b[0m');
              ws.close();
          });

          dockerProcess.on('error', (err) => {
              console.error('SSH to sonic-vm process error:', err);
              ws.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
              ws.close();
          });

      } else {
          sshClient = new Client();

          console.log(`Attempting SSH connection to ${nodeIp}`);
          sshClient.connect({
            host: nodeIp,
            username: 'admin',
            tryKeyboard: true,
            readyTimeout: 10000,
            debug: console.log
          });

          sshClient.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => {
            console.log('Keyboard interactive authentication requested');
            const responses = prompts.map(() => 'admin');
            finish(responses);
          });

          sshClient.on('authenticationRequired', (authMethods) => {
            console.log('Authentication required, methods:', authMethods);
            if (!authMethods || authMethods.length === 0) {
              sshClient.authPassword('admin', 'admin');
            }
          });

          sshClient.on('error', (err) => {
            console.error('SSH connection error:', err);
            ws.send(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
          });

          const connectionTimeout = setTimeout(() => {
            if (sshClient && !sshClient._sock) {
              console.error('SSH connection timeout');
              ws.send('\r\n\x1b[31mError: Connection timeout\x1b[0m');
              sshClient.end();
            }
          }, 10000);

          sshClient.on('ready', () => {
            clearTimeout(connectionTimeout);
            console.log('SSH connection ready');
            sshClient.shell({ term: 'xterm-256color' }, (err, stream) => {
              if (err) {
                console.error('Error creating shell:', err);
                ws.send('\r\n\x1b[31mError: Failed to create shell\x1b[0m');
                return;
              }

              console.log('Shell created successfully');
              sshStream = stream;

              stream.on('data', (data) => {
                const output = data.toString();
                ws.send(output);
              });

              stream.on('close', () => {
                console.log('SSH stream closed');
                sshClient.end();
                sshStream = null;
              });
            });
          });
      }

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      ws.send(`\r\n\x1b[31mError: ${error.message}\x1b[0m`);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    if (sshClient) {
      sshClient.end();
    } else if (dockerProcess) {
        dockerProcess.kill();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (sshClient) {
      sshClient.end();
    } else if (dockerProcess) {
        dockerProcess.kill();
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  console.log(`WebSocket server is ready at ws://0.0.0.0:${port}/ws/ssh`);
});