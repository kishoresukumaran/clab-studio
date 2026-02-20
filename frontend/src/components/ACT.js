/**
 * ACT.js - Arista Containerlab Topology Designer
 * 
 * Copyright (c) 2024-2025 Arista Networks, Inc.
 * 
 * Author: Kishore Sukumaran
 * 
 * This component provides the ACT (BETA) page for designing the topologies that render the YAML supported by the ACT lab.
 * It displays the side bar with various options to design the topology, allows users to create topology, and download the YAML.
 * 
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import CytoscapeCanvas from './CytoscapeCanvas';
import Sidebar from '../Sidebar';
import yaml from 'js-yaml';
import '../styles.css';

const ACT = () => {
  const cyCanvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [connectSourceNode, setConnectSourceNode] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [nodeName, setNodeName] = useState("");
  const [newNode, setNewNode] = useState(null);
  const [yamlOutput, setYamlOutput] = useState("");
  const [nodeModalWarning, setNodeModalWarning] = useState(false);
  // cyCanvasRef used instead of reactFlowInstance
  const [nodeIp, setNodeIp] = useState("");
  const [nodeType, setNodeType] = useState("");
  const [deviceModel, setDeviceModel] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [isModifying, setIsModifying] = useState(false);
  const [showVeos, setShowVeos] = useState(false);
  const [showCvp, setShowCvp] = useState(false);
  const [showGeneric, setShowGeneric] = useState(false);
  const [isYamlValid, setIsYamlValid] = useState(true);
  const [yamlParseError, setYamlParseError] = useState("");
  const [isUpdatingFromYaml, setIsUpdatingFromYaml] = useState(false);
  const [edgeContextMenu, setEdgeContextMenu] = useState(null);

  const [veosInputs, setVeosInputs] = useState({
    username: '',
    password: '',
    version: ''
  });

  const [cvpInputs, setCvpInputs] = useState({
    username: '',
    password: '',
    version: '',
    instance: '',
    ipAddress: '',
    autoConfig: false
  });

  const [genericInputs, setGenericInputs] = useState({
    username: '',
    password: '',
    version: ''
  });

  const [isEdgeModalOpen, setIsEdgeModalOpen] = useState(false);
  const [sourceInterface, setSourceInterface] = useState("");
  const [targetInterface, setTargetInterface] = useState("");
  const [newEdgeData, setNewEdgeData] = useState(null);
  const [edgeModalWarning, setEdgeModalWarning] = useState(false);

  // Handle "Connect" context menu action
  const handleConnectNode = useCallback(() => {
    setConnectSourceNode(contextMenu.element);
    setContextMenu(null);
  }, [contextMenu]);

  const onNodeTap = useCallback((nodeData) => {
    if (connectSourceNode && nodeData.id !== connectSourceNode.id) {
      const sourceNode = nodes.find(n => n.id === connectSourceNode.id);
      const targetNode = nodes.find(n => n.id === nodeData.id);
      if (!sourceNode || !targetNode) {
        setConnectSourceNode(null);
        return;
      }
      setNewEdgeData({
        source: connectSourceNode.id,
        target: nodeData.id,
        sourceNodeName: sourceNode.data.label,
        targetNodeName: targetNode.data.label,
      });
      setIsEdgeModalOpen(true);
      setConnectSourceNode(null);
    }
  }, [connectSourceNode, nodes]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const cy = cyCanvasRef.current?.getCy();
      let position;
      if (cy) {
        const containerRect = cy.container().getBoundingClientRect();
        const zoom = cy.zoom();
        const pan = cy.pan();
        position = {
          x: (event.clientX - containerRect.left - pan.x) / zoom,
          y: (event.clientY - containerRect.top - pan.y) / zoom,
        };
      } else {
        position = { x: 200, y: 200 };
      }

      const newNode = {
        id: `node_${nodes.length + 1}`,
        position,
        data: { label: `${type} node` }
      };

      setNewNode(newNode);
      setIsModalOpen(true);
    },
    [nodes]
  );

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setConnectSourceNode(null);
    setEdgeContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      element: edge,
    });
  }, []);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setConnectSourceNode(null);
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      element: node,
    });
  }, []);

  const onNodeDragStop = useCallback(({ id, position }) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, position } : n));
  }, []);

  const handleEdgeContextMenuClose = () => {
    setEdgeContextMenu(null);
  };

  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  const handleRemoveEdge = () => {
    const edgeToRemove = edgeContextMenu.element;
    setEdges((eds) => eds.filter((e) => e.id !== edgeToRemove.id));
    setEdgeContextMenu(null);
  };

  const handleRemoveNode = () => {
    const nodeToRemove = contextMenu.element;
    setNodes((nds) => nds.filter((n) => n.id !== nodeToRemove.id));
    setContextMenu(null);
  };

  const handleModifyEdge = () => {
    const edgeToModify = edgeContextMenu.element;

    const sourceNode = nodes.find(node => node.id === edgeToModify.source);
    const targetNode = nodes.find(node => node.id === edgeToModify.target);

    setSourceInterface(edgeToModify.data?.sourceInterface || "");
    setTargetInterface(edgeToModify.data?.targetInterface || "");
    setNewEdgeData({
      ...edgeToModify,
      sourceNodeName: sourceNode?.data.label,
      targetNodeName: targetNode?.data.label
    });

    setIsEdgeModalOpen(true);
    setEdgeContextMenu(null);
  };

  const handleModifyNode = () => {
    const nodeToModify = contextMenu.element;
    setNodeName(nodeToModify.data.label);
    setNodeIp(nodeToModify.data.ip || "");
    setNodeType(nodeToModify.data.type || "");
    setDeviceModel(nodeToModify.data.model || "");
    setNewNode(nodeToModify);
    setIsModifying(true);
    setIsModalOpen(true);
    setContextMenu(null);
  };

  const handleModalSubmit = () => {
    if (!nodeName.trim()) {
      setNodeModalWarning(true);
      return;
    }

    const newNodeWithData = {
      ...newNode,
      data: {
        ...newNode.data,
        label: nodeName,
        ip: nodeIp,
        type: nodeType,
        model: deviceModel
      }
    };

    if (isModifying) {
      setNodes((nds) => 
        nds.map((node) => 
          node.id === newNode.id ? newNodeWithData : node
        )
      );
      setIsModifying(false);
    } else {
      setNodes((nds) => [...nds, newNodeWithData]);
    }

    setIsModalOpen(false);
    setNodeName("");
    setNodeIp("");
    setNodeType("");
    setDeviceModel("");
    setNodeModalWarning(false);
  };

  const handleEdgeModalSubmit = () => {
    if (!sourceInterface.trim() || !targetInterface.trim()) {
      setEdgeModalWarning(true);
      return;
    }
  
    if (newEdgeData.id) {
      setEdges((eds) => eds.map((edge) => 
        edge.id === newEdgeData.id 
          ? {
              ...edge,
              data: {
                sourceInterface,
                targetInterface
              }
            }
          : edge
      ));
    } else {
      const newEdge = {
        ...newEdgeData,
        id: `edge_${newEdgeData.source}_${newEdgeData.target}`,
        data: {
          sourceInterface,
          targetInterface
        }
      };
      setEdges((eds) => [...eds, newEdge]);
    }
  
    setIsEdgeModalOpen(false);
    setSourceInterface("");
    setTargetInterface("");
    setNewEdgeData(null);
    setEdgeModalWarning(false);
  };

  const updateYamlFromDiagram = () => {
    if (isUpdatingFromYaml) return;
    
    let yamlSections = [];
    let nodesData = { nodes: [] };

    if (showVeos) {
      const veosSection = yaml.dump({
        veos: {
          username: veosInputs.username,
          password: veosInputs.password,
          version: veosInputs.version
        }
      });
      yamlSections.push(veosSection);
    }

    if (showCvp) {
      const cvpSection = yaml.dump({
        cvp: {
          username: cvpInputs.username,
          password: cvpInputs.password,
          version: cvpInputs.version,
          instance: cvpInputs.instance
        }
      });
      yamlSections.push(cvpSection);
      nodesData.nodes.push({
        CVP: {
          ip_addr: cvpInputs.ipAddress,
          node_type: 'cvp',
          auto_configuration: cvpInputs.autoConfig
        }
      });
    }

    if (showGeneric) {
      const genericSection = yaml.dump({
        generic: {
          username: genericInputs.username,
          password: genericInputs.password,
          version: genericInputs.version
        }
      });
      yamlSections.push(genericSection);
    }

    nodes.forEach(node => {
      if (node.data && node.data.label) {
        nodesData.nodes.push({
          [node.data.label]: {
            ip_addr: node.data.ip || "",
            node_type: node.data.type || "",
            device_model: node.data.model || ""
          }
        });
      }
    });

    if (nodesData.nodes.length > 0) {
      yamlSections.push(yaml.dump(nodesData));
    }

    if (edges.length > 0) {
      const linksData = {
        links: edges.map(edge => {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          if (sourceNode && targetNode && edge.data) {
            return {
              connection: [
                `${sourceNode.data.label}:${edge.data.sourceInterface}`,
                `${targetNode.data.label}:${edge.data.targetInterface}`
              ]
            };
          }
          return null;
        }).filter(link => link !== null)
      };
      
      if (linksData.links.length > 0) {
        yamlSections.push(yaml.dump(linksData));
      }
    }

    setYamlOutput(yamlSections.join('\n'));
    setIsYamlValid(true);
    setYamlParseError("");
  };

  const handleYamlChange = (event) => {
    const newYaml = event.target.value;
    setYamlOutput(newYaml);
    setIsUpdatingFromYaml(true);
  
    try {
      if (newYaml.trim() === '') {
        setNodes([]);
        setEdges([]);
        setIsYamlValid(true);
        setYamlParseError('');
        return;
      }

      const parsedYaml = yaml.load(newYaml);
      
      let newNodes = [];
      let nodeCounter = 1;
      let positionCounter = 0;

      if (parsedYaml.veos) {
        setShowVeos(true);
        setVeosInputs({
          username: parsedYaml.veos.username || '',
          password: parsedYaml.veos.password || '',
          version: parsedYaml.veos.version || ''
        });
      } else {
        setShowVeos(false);
      }

      if (parsedYaml.cvp) {
        setShowCvp(true);
        setCvpInputs({
          username: parsedYaml.cvp.username || '',
          password: parsedYaml.cvp.password || '',
          version: parsedYaml.cvp.version || '',
          instance: parsedYaml.cvp.instance || '',
          ipAddress: '',
          autoConfig: false
        });
      } else {
        setShowCvp(false);
      }

      if (parsedYaml.generic) {
        setShowGeneric(true);
        setGenericInputs({
          username: parsedYaml.generic.username || '',
          password: parsedYaml.generic.password || '',
          version: parsedYaml.generic.version || ''
        });
      } else {
        setShowGeneric(false);
      }

      if (parsedYaml.nodes) {
        newNodes = parsedYaml.nodes.map((nodeObj) => {
          const nodeName = Object.keys(nodeObj)[0];
          const nodeData = nodeObj[nodeName];
          
          const columns = 3;
          const rowHeight = 150;
          const colWidth = 200;
          const row = Math.floor(positionCounter / columns);
          const col = positionCounter % columns;
          positionCounter++;

          if (nodeName === "CVP" && nodeData.node_type === "cvp") {
            setCvpInputs(prev => ({
              ...prev,
              ipAddress: nodeData.ip_addr || '',
              autoConfig: nodeData.auto_configuration || false
            }));
          }

          return {
            id: `node_${nodeCounter++}`,
            position: { x: 100 + col * colWidth, y: 100 + row * rowHeight },
            data: {
              label: nodeName,
              ip: nodeData.ip_addr || "",
              type: nodeData.node_type || "",
              model: nodeData.device_model || ""
            }
          };
        });
      }

      let newEdges = [];
      if (parsedYaml.links) {
        newEdges = parsedYaml.links.map((linkObj, index) => {
          const [sourceNodeName, sourceInterface] = linkObj.connection[0].split(':');
          const [targetNodeName, targetInterface] = linkObj.connection[1].split(':');
          const sourceNode = newNodes.find(n => n.data.label === sourceNodeName);
          const targetNode = newNodes.find(n => n.data.label === targetNodeName);

          if (sourceNode && targetNode) {
            return {
              id: `edge_${sourceNode.id}_${targetNode.id}_${sourceInterface}_${targetInterface}`,
              source: sourceNode.id,
              target: targetNode.id,
              data: {
                sourceInterface,
                targetInterface
              }
            };
          }
          return null;
        }).filter(edge => edge !== null);
      }

      setNodes(newNodes);
      setEdges(newEdges);
      setIsYamlValid(true);
      setYamlParseError('');
      
    } catch (error) {
      console.error('Failed to parse YAML:', error);
      setIsYamlValid(false);
      setYamlParseError(`Error parsing YAML: ${error.message}`);
      setYamlOutput(newYaml);
    }
  };

  useEffect(() => {
    if (!isUpdatingFromYaml) {
      updateYamlFromDiagram();
    }
  }, [
    showVeos, showCvp, showGeneric,
    veosInputs, cvpInputs, genericInputs,
    nodes, edges,
    isUpdatingFromYaml  
  ]);

  const handleYamlBlur = () => {
    setIsUpdatingFromYaml(false);
    updateYamlFromDiagram();
  };

  const handleVeosCheckbox = (e) => {
    setShowVeos(e.target.checked);
    if (!e.target.checked) {
      setVeosInputs({ username: '', password: '', version: '' });
    }
  };

  const handleDownloadYaml = () => {
    const blob = new Blob([yamlOutput], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = 'network_topology.yaml';
    
    document.body.appendChild(link);
    link.click();
    
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  };

  const handleCvpCheckbox = (e) => {
    setShowCvp(e.target.checked);
    if (!e.target.checked) {
      setCvpInputs({ username: '', password: '', version: '', instance: '', ipAddress: '', autoConfig: false });
    }
  };

  const handleGenericCheckbox = (e) => {
    setShowGeneric(e.target.checked);
    if (!e.target.checked) {
      setGenericInputs({ username: '', password: '', version: '' });
    }
  };

  const handleReset = () => {
    setNodes([]);
    setEdges([]);
    setYamlOutput("");
    setShowVeos(false);
    setShowCvp(false);
    setShowGeneric(false);
    setVeosInputs({
      username: '',
      password: '',
      version: ''
    });
    setCvpInputs({
      username: '',
      password: '',
      version: '',
      instance: '',
      ipAddress: '',
      autoConfig: false
    });
    setGenericInputs({
      username: '',
      password: '',
      version: ''
    });
  };

  const handleApplyYaml = () => {
    try {
      updateYamlFromDiagram();
      setIsYamlValid(true);
      setYamlParseError("");
    } catch (error) {
      setIsYamlValid(false);
      setYamlParseError(`Error applying YAML: ${error.message}`);
    }
  };

  return (
    <div className="dndflow">
      <div className="node-panel">
        <h3 className="settings-heading">Global Settings</h3>
        <div className="checkbox-group-act">
          <label>
            <input
              type="checkbox"
              checked={showVeos}
              onChange={handleVeosCheckbox}
            />
            Add vEOS
          </label>
        </div>
        {showVeos && (
          <div className="input-section-act">
            <div className="input-group-act">
              <label>Username:</label>
              <input
                type="text"
                value={veosInputs.username}
                onChange={(e) => setVeosInputs({...veosInputs, username: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Password:</label>
              <input
                type="password"
                value={veosInputs.password}
                onChange={(e) => setVeosInputs({...veosInputs, password: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Version:</label>
              <input
                type="text"
                value={veosInputs.version}
                onChange={(e) => setVeosInputs({...veosInputs, version: e.target.value})}
              />
            </div>
          </div>
        )}

        <div className="checkbox-group-act">
          <label>
            <input
              type="checkbox"
              checked={showCvp}
              onChange={handleCvpCheckbox}
            />
            Add CVP
          </label>
        </div>
        {showCvp && (
          <div className="input-section-act">
            <div className="input-group-act">
              <label>Username:</label>
              <input
                type="text"
                value={cvpInputs.username}
                onChange={(e) => setCvpInputs({...cvpInputs, username: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Password:</label>
              <input
                type="password"
                value={cvpInputs.password}
                onChange={(e) => setCvpInputs({...cvpInputs, password: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Version:</label>
              <input
                type="text"
                value={cvpInputs.version}
                onChange={(e) => setCvpInputs({...cvpInputs, version: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Instance:</label>
              <input
                type="text"
                value={cvpInputs.instance}
                onChange={(e) => setCvpInputs({...cvpInputs, instance: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>IP Address:</label>
              <input
                type="text"
                value={cvpInputs.ipAddress}
                onChange={(e) => setCvpInputs({...cvpInputs, ipAddress: e.target.value})}
                placeholder="e.g., 192.168.0.10"
              />
            </div>
            <div className="toggle-group-act">
              <label>Auto Configuration:</label>
              <div className="toggle-switch-act">
                <input
                  type="checkbox"
                  id="auto-config"
                  checked={cvpInputs.autoConfig}
                  onChange={(e) => setCvpInputs({...cvpInputs, autoConfig: e.target.checked})}
                />
                <label htmlFor="auto-config">
                  <span className="toggle-label-act">{cvpInputs.autoConfig ? 'YES' : 'NO'}</span>
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="checkbox-group-act">
          <label>
            <input
              type="checkbox"
              checked={showGeneric}
              onChange={handleGenericCheckbox}
            />
            Add Generic
          </label>
        </div>
        {showGeneric && (
          <div className="input-section-act">
            <div className="input-group-act">
              <label>Username:</label>
              <input
                type="text"
                value={genericInputs.username}
                onChange={(e) => setGenericInputs({...genericInputs, username: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Password:</label>
              <input
                type="password"
                value={genericInputs.password}
                onChange={(e) => setGenericInputs({...genericInputs, password: e.target.value})}
              />
            </div>
            <div className="input-group-act">
              <label>Version:</label>
              <input
                type="text"
                value={genericInputs.version}
                onChange={(e) => setGenericInputs({...genericInputs, version: e.target.value})}
              />
            </div>
          </div>
        )}
        <hr className="act-divider" />
        <div className="act-section">
          <Sidebar />
        </div>
        <hr className="act-divider" />
        <div className="node-panel-act">
          <button className="reset-button-act" onClick={handleReset}>
            Reset All Fields
          </button>
        </div>
      </div>
      <div className="cytoscape-wrapper" onDrop={onDrop} onDragOver={onDragOver}>
        <CytoscapeCanvas
          ref={cyCanvasRef}
          nodes={nodes}
          edges={edges}
          onNodeContextMenu={onNodeContextMenu}
          onEdgeContextMenu={onEdgeContextMenu}
          onNodeDragStop={onNodeDragStop}
          onNodeTap={onNodeTap}
          connectSourceNodeId={connectSourceNode?.id || null}
        />
      </div>
      <div className="yaml-output">
        <div className="yaml-header-act">
          <h3>YAML Editor</h3>
          <div className="yaml-actions">
            <button className="download-button-act" onClick={handleDownloadYaml} disabled={!yamlOutput.trim()}>
              Download YAML
            </button>
          </div>
        </div>
        {!isYamlValid && (
          <div className="yaml-error-message">
            {yamlParseError}
          </div>
        )}
        <textarea
          className={`yaml-editor ${!isYamlValid ? 'yaml-error' : ''}`}
          value={yamlOutput}
          onChange={handleYamlChange}
          onBlur={handleYamlBlur}
          spellCheck="false"
        />
      </div>

      {isModalOpen && (
        <div className="modal">
          <div className="modal-content">
            <h2>Enter Node Details</h2>
            {nodeModalWarning && (
              <div className="warning-message">
                Node Name is required
              </div>
            )}
            <div className="input-group">
              <label>Name of the node:</label>
              <input
                type="text"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                className={nodeModalWarning && !nodeName.trim() ? 'input-error' : ''}
              />
            </div>
            <div className="input-group">
              <label>IP Address:</label>
              <input
                type="text"
                value={nodeIp}
                onChange={(e) => setNodeIp(e.target.value)}
                placeholder="e.g., 192.168.1.1"
              />
            </div>
            <div className="input-group">
              <label>Node Type:</label>
              <input
                type="text"
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value)}
                placeholder="e.g., Router"
              />
            </div>
            <div className="input-group">
              <label>Device Model:</label>
              <input
                type="text"
                value={deviceModel}
                onChange={(e) => setDeviceModel(e.target.value)}
                placeholder="e.g., DCS-7280"
              />
            </div>
            <div className="actions">
              <button onClick={handleModalSubmit}>Submit</button>
              <button onClick={() => {
                setIsModalOpen(false);
                setNodeName("");
                setNodeIp("");
                setNodeType("");
                setDeviceModel("");
                setNodeModalWarning(false);
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {isEdgeModalOpen && (
        <div className="modal-act">
          <div className="modal-content-act">
            <h2>Configure Link Interfaces</h2>
            {edgeModalWarning && (
              <div className="warning-message">
                Both interfaces are required
              </div>
            )}
            <div className="form-content">
              <div className="input-group-act">
                <label>{newEdgeData?.sourceNodeName} Interface:</label>
                <input
                  type="text"
                  value={sourceInterface}
                  onChange={(e) => setSourceInterface(e.target.value)}
                  placeholder="e.g., Ethernet1"
                  className={edgeModalWarning && !sourceInterface.trim() ? 'input-error' : ''}
                />
              </div>
              <div className="input-group-act">
                <label>{newEdgeData?.targetNodeName} Interface:</label>
                <input
                  type="text"
                  value={targetInterface}
                  onChange={(e) => setTargetInterface(e.target.value)}
                  placeholder="e.g., Ethernet1"
                  className={edgeModalWarning && !targetInterface.trim() ? 'input-error' : ''}
                />
              </div>
            </div>
            <div className="actions">
              <button onClick={handleEdgeModalSubmit}>Submit</button>
              <button onClick={() => {
                setIsEdgeModalOpen(false);
                setSourceInterface("");
                setTargetInterface("");
                setNewEdgeData(null);
                setEdgeModalWarning(false);
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.mouseY,
            left: contextMenu.mouseX,
            zIndex: 1000,
          }}
        >
          <button onClick={handleConnectNode}>Connect</button>
          <button onClick={handleModifyNode}>Modify</button>
          <button className="delete-button" onClick={handleRemoveNode}>Delete</button>
        </div>
      )}

      {edgeContextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            top: edgeContextMenu.mouseY,
            left: edgeContextMenu.mouseX,
            zIndex: 1000,
          }}
        >
          <button onClick={handleModifyEdge}>Modify</button>
          <button className="delete-button" onClick={handleRemoveEdge}>Delete</button>
        </div>
      )}
    </div>
  );
};

export default ACT;