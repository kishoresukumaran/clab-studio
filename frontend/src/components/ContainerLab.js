/**
 * ContainerLab.js - Containerlab Studio
 * 
 * Copyright (c) 2024-2025 Arista Networks, Inc.
 * 
 * Author: Kishore Sukumaran
 * 
 * This component provides the Topology Designer page for designing the containerlab topologies.
 * It displays the side bar with various options to design the topology, allows users to create, modify the topology, and deploy it to a containerlab server.
 * It also shows options to Import and Save the topologies. There is also the File Manager to manage the files in the containerlab servers.
 * 
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import CytoscapeCanvas from './CytoscapeCanvas';
import Sidebar from "../Sidebar";
import { saveAs } from "file-saver";
import "../styles.css";
import ELK from 'elkjs/lib/elk.bundled.js';
import { Server, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import LogModal from './LogModal';
import FileManagerModal from './FileManagerModal';
import { useTopology } from '../contexts/TopologyContext';

import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism-tomorrow.css';

import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';

const elk = new ELK();

const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.spacing.nodeNode': 80,
  'elk.direction': 'RIGHT',
  'elk.spacing.portPort': 30,
};

/**
 * Prepares node and edge data for the ELK layout algorithm.

 * 
 * This function:
 * 1. Transforms React Flow nodes and edges into the format required by the ELK layout algorithm
 * 2. Sets fixed dimensions for each node (150x100)
 * 3. Preserves port information from the original nodes for connection points
 * 4. Maps edge connections using source and target node IDs
 * 
 * The resulting graph object will be processed by the ELK layout engine to calculate
 * optimal positions for all nodes and edges in the network topology visualization.
 */
const getLayoutedElements = async (nodes, edges) => {
  const graph = {
    id: 'root',
    layoutOptions,
    children: nodes.map((node) => ({
      id: node.id,
      width: 150,
      height: 100,
      ports: node.data.ports || []
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target]
    }))
  };

  const layoutedGraph = await elk.layout(graph);
  return layoutedGraph;
};

let id = 0;
const getId = () => `node_${id++}`;

const DEFAULT_YAML = {};

/**
 * Converts a containerlab YAML definition to a visual topology for React Flow.
 * 
 * This function:
 * 1. Parses the YAML string into a structured object
 * 2. Extracts node definitions from the YAML topology section
 * 3. Creates new React Flow node objects with appropriate properties
 * 4. Arranges nodes in a simple grid layout
 * 5. Filters edges to only include those connecting nodes in the new topology
 * 
 * The resulting topology can be directly rendered in React Flow, maintaining
 * the structure defined in the containerlab YAML while providing a visual
 * representation of the network.
 */
const convertYamlToTopology = (yamlString, existingEdges, existingNodes) => {
  try {
    const parsedYaml = yaml.load(yamlString);
    if (!parsedYaml?.topology?.nodes) return null;
    const existingPositions = {};
    existingNodes.forEach(node => {
      existingPositions[node.id] = node.position;
    });

    const newNodes = [];
    let nodePosition = { x: 100, y: 100 };

    Object.entries(parsedYaml.topology.nodes).forEach(([nodeName, nodeData]) => {
      newNodes.push({
        id: nodeName,
        position: existingPositions[nodeName] || { ...nodePosition },
        data: {
          label: nodeName,
          kind: nodeData.kind
        }
      });
      nodePosition.x += 200;
    });

    // Filter edges to only include those connecting nodes in the new topology
    const filteredEdges = existingEdges
      .filter(edge =>
        newNodes.some(node => node.id === edge.source) &&
        newNodes.some(node => node.id === edge.target)
      );
      
    return {
      nodes: newNodes,
      edges: filteredEdges
    };
  } catch (error) {
    console.error('Invalid YAML:', error);
    return null;
  }
};

// This is the list of random names to use for the name of the topology in the topology designer page
const randomNames = {
  cartoonCharacters: [
    'Mickey', 'Donald', 'Goofy', 'Pluto', 'Minnie', 'Daisy', 'Scrooge', 'Huey', 'Dewey', 'Louie',
    'Bugs', 'Daffy', 'Porky', 'Tweety', 'Sylvester', 'Elmer', 'RoadRunner', 'WileE', 'Marvin', 'Speedy',
    'Tom', 'Jerry', 'Spike', 'Tyke', 'Droopy', 'Butch', 'Nibbles', 'Toodles', 'Lightning', 'Tuffy',
    'Scooby', 'Shaggy', 'Velma', 'Daphne', 'Fred', 'Scrappy', 'Yogi', 'BooBoo', 'Cindy', 'RangerSmith',
    'Snagglepuss', 'Huckleberry', 'QuickDraw', 'BabaLooey', 'AugieDoggie', 'DoggieDaddy', 'Pixie', 'Dixie', 'Jinks', 'TopCat',
    'Benny', 'ChooChoo', 'Brain', 'FancyFancy', 'Spook', 'Flintstone', 'Barney', 'Wilma', 'Betty', 'Pebbles',
    'BammBamm', 'Dino', 'MrSlate', 'GeorgeJetson', 'JaneJetson', 'JudyJetson', 'ElroyJetson', 'Astro', 'Rosie', 'Cogswell',
    'RichieRich', 'Casper', 'Wendy', 'HotStuff', 'LittleDot', 'LittleLot', 'Harvey', 'BabyHuey', 'Felix', 'Garfield'
  ],
  irishPlaces: [
    'Dublin', 'Cork', 'Galway', 'Limerick', 'Waterford', 'Kilkenny', 'Sligo', 'Donegal', 'Kerry', 'Clare',
    'Mayo', 'Wicklow', 'Kildare', 'Meath', 'Louth', 'Wexford', 'Carlow', 'Laois', 'Offaly', 'Westmeath',
    'Roscommon', 'Tipperary', 'Monaghan', 'Cavan', 'Leitrim', 'Longford', 'Fermanagh', 'Armagh', 'Down', 'Antrim',
    'Derry', 'Tyrone', 'Lisburn', 'Newry', 'Ennis', 'Tralee', 'Letterkenny', 'Navan', 'Naas', 'Athlone',
    'Mullingar', 'Portlaoise', 'Tullamore', 'Bray', 'Greystones', 'Swords', 'Drogheda', 'Dundalk', 'Arklow', 'Balbriggan',
    'Celbridge', 'Clonmel', 'KilkennyCity', 'Carrickfergus', 'Newtownabbey', 'Bangor', 'Lurgan', 'Banbridge', 'Omagh', 'Coleraine',
    'Cobh', 'Midleton', 'Mallow', 'Killarney', 'Shannon', 'Tuam', 'Ballina', 'Castlebar', 'Trim', 'Birr'
  ]
};


/**
 * Main component for the Containerlab Studio.
 * 
 * This App component:
 * 1. Manages the state of the topology designer, and handles the desigining of the topology
 * 2. Handles the creation, modification, and deletion of nodes and edges
 * 3. Manages the YAML output generation of the topology
 * 4. Manages the deployment of the topology to a containerlab server
 * 5. Manages the import and save of topologies to the containerlab servers
 */
const App = ({ user, parentSetMode }) => {
  const { topologyState, updateTopologyState } = useTopology();
  const cyCanvasRef = useRef(null);

  // Replace local state with context state
  const [nodes, setNodes] = useState(topologyState.nodes);
  const [edges, setEdges] = useState(topologyState.edges);
  const [connectSourceNode, setConnectSourceNode] = useState(null);
  const [yamlOutput, setYamlOutput] = useState(topologyState.yamlOutput);
  const [topologyName, setTopologyName] = useState(topologyState.topologyName);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNode, setNewNode] = useState(null);
  const [nodeName, setNodeName] = useState("");
  const [nodeBinds, setNodeBinds] = useState([{ source: '', target: '' }]);
  const [isYamlValid, setIsYamlValid] = useState(topologyState.isYamlValid);
  const [yamlParseError, setYamlParseError] = useState(topologyState.yamlParseError);
  const [contextMenu, setContextMenu] = useState(null);
  const [isEdgeModalOpen, setIsEdgeModalOpen] = useState(false);
  const [newEdgeData, setNewEdgeData] = useState(null);
  const [sourceInterface, setSourceInterface] = useState("");
  const [targetInterface, setTargetInterface] = useState("");
  const [showWarning, setShowWarning] = useState(false);
  const [nodeKind, setNodeKind] = useState("ceos");
  const [nodeImage, setNodeImage] = useState("arista_ceos:4.35.1F");
  const [nodeModalWarning, setNodeModalWarning] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [isModifyingEdge, setIsModifyingEdge] = useState(false);
  const [edgeModalWarning, setEdgeModalWarning] = useState(false);
  const [mode, setMode] = useState('containerlab');
  // reactFlowInstance removed - using cyCanvasRef instead
  const [editableYaml, setEditableYaml] = useState(topologyState.editableYaml);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [deployLoading, setDeployLoading] = useState({});
  const [reconfigureLoading, setReconfigureLoading] = useState({});
  const [labExistsOnServer, setLabExistsOnServer] = useState({});
  const [showLogModal, setShowLogModal] = useState(false);
  const [operationLogs, setOperationLogs] = useState('');
  const [operationTitle, setOperationTitle] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [deploymentSuccess, setDeploymentSuccess] = useState(false);
  const [modalMode, setModalMode] = useState('import');
  const [nodeInterfaces, setNodeInterfaces] = useState(topologyState.nodeInterfaces || {});
  const [nodeCreationMode, setNodeCreationMode] = useState('single'); 
  const [nodeCount, setNodeCount] = useState(1);
  const [nodeNamePrefix, setNodeNamePrefix] = useState('');
  const [showModifyNodeModal, setShowModifyNodeModal] = useState(false);
  const [serverResources, setServerResources] = useState({});
  const [autoAssignMacSn, setAutoAssignMacSn] = useState({});
  const [isLoadingServerResources, setIsLoadingServerResources] = useState(false);
  const [nodeStartupConfig, setNodeStartupConfig] = useState('');
  const [showFileManagerForStartupConfig, setShowFileManagerForStartupConfig] = useState(false);

  const [showFileManager, setShowFileManager] = useState(false);
  const [showFileManagerForBind, setShowFileManagerForBind] = useState(false);
  const [activeBindIndex, setActiveBindIndex] = useState(null);
  const [showOptionalSettings, setShowOptionalSettings] = useState(false);
  const [selectedTopologyNodes, setSelectedTopologyNodes] = useState([]);
  const [showGitDeployModal, setShowGitDeployModal] = useState(false);
  const [gitRepoUrl, setGitRepoUrl] = useState('');
  const [showTopoFileSelectModal, setShowTopoFileSelectModal] = useState(false);
  const [gitTopoFiles, setGitTopoFiles] = useState([]);
  const [selectedTopoFile, setSelectedTopoFile] = useState('');
  const [gitClonedDir, setGitClonedDir] = useState('');
  const [gitRepoName, setGitRepoName] = useState('');
  const [isGitScanning, setIsGitScanning] = useState(false);
  const [serverMetrics, setServerMetrics] = useState({});
  const [nodeCustomFields, setNodeCustomFields] = useState([{ key: '', value: '' }]);
  const [modalType, setModalType] = useState("create");

  // Generate topology modal states
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [numberOfTiers, setNumberOfTiers] = useState('2');
  const [numberOfSpines, setNumberOfSpines] = useState('');
  const [numberOfLeafs, setNumberOfLeafs] = useState('');
  const [numberOfSuperSpines, setNumberOfSuperSpines] = useState('');
  const [generateEosVersion, setGenerateEosVersion] = useState('');
  const [generateEosVersionError, setGenerateEosVersionError] = useState('');
  const [generateSuperSpinesError, setGenerateSuperSpinesError] = useState('');
  const [generateSpinesError, setGenerateSpinesError] = useState('');
  const [generateLeafsError, setGenerateLeafsError] = useState('');
  const [spinesInMlag, setSpinesInMlag] = useState(false);
  const [leafsInMlag, setLeafsInMlag] = useState(false);
  const [addHosts, setAddHosts] = useState(false);
  const [numberOfHosts, setNumberOfHosts] = useState('');
  const [hostsError, setHostsError] = useState('');
  const [hostParents, setHostParents] = useState({});
  const [hostParentErrors, setHostParentErrors] = useState({});
  const [useDefaultPrefix, setUseDefaultPrefix] = useState(true);
  const [tier1Prefix, setTier1Prefix] = useState('');
  const [tier2Prefix, setTier2Prefix] = useState('');
  const [tier3Prefix, setTier3Prefix] = useState('');
  const [tierPrefixErrors, setTierPrefixErrors] = useState({});
  const [addStartupConfig, setAddStartupConfig] = useState(false);
  const [applyStartupConfigToAll, setApplyStartupConfigToAll] = useState(true);
  const [generateStartupConfigPath, setGenerateStartupConfigPath] = useState('');
  const [generateStartupConfigError, setGenerateStartupConfigError] = useState('');
  const [selectedDevicesForStartupConfig, setSelectedDevicesForStartupConfig] = useState({ superSpines: [], spines: [], leafs: [], hosts: [] });
  const [addBinds, setAddBinds] = useState(false);
  const [applyBindsToAll, setApplyBindsToAll] = useState(true);
  const [generateBinds, setGenerateBinds] = useState([{ source: '', target: '' }]);
  const [generateBindsErrors, setGenerateBindsErrors] = useState([]);
  const [selectedDevicesForBinds, setSelectedDevicesForBinds] = useState({ superSpines: [], spines: [], leafs: [], hosts: [] });

  // Add state for YAML editor toggle
  const [isYamlEditorCollapsed, setIsYamlEditorCollapsed] = useState(() => {
    // Load from localStorage if available, default to true (collapsed)
    const saved = localStorage.getItem('yamlEditorCollapsed');
    return saved ? JSON.parse(saved) : true;
  });

  // Get annotation states from context
  const {
    annotations,
    activeTool,
    selectedAnnotation,
    annotationColor,
    textStyle,
    shapeStyle
  } = topologyState;

  // Helper functions to update annotation states in context
  const setAnnotations = (newAnnotations) => {
    const annotations = typeof newAnnotations === 'function' 
      ? newAnnotations(topologyState.annotations) 
      : newAnnotations;
    updateTopologyState({ annotations });
  };

  const setActiveTool = (newTool) => {
    updateTopologyState({ activeTool: newTool });
  };

  const setSelectedAnnotation = (newSelected) => {
    updateTopologyState({ selectedAnnotation: newSelected });
  };

  const setAnnotationColor = (newColor) => {
    updateTopologyState({ annotationColor: newColor });
  };

  const setTextStyle = (newStyle) => {
    const textStyle = typeof newStyle === 'function' 
      ? newStyle(topologyState.textStyle) 
      : newStyle;
    updateTopologyState({ textStyle });
  };

  const setShapeStyle = (newStyle) => {
    const shapeStyle = typeof newStyle === 'function' 
      ? newStyle(topologyState.shapeStyle) 
      : newStyle;
    updateTopologyState({ shapeStyle });
  };
  
  // Annotation interaction states (these can remain local as they're temporary UI states)
  const [isDraggingAnnotation, setIsDraggingAnnotation] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState(null);

  // nodeTypes and edgeTypes removed - Cytoscape handles rendering via styles

  /* This is the list of images that can be used for the nodes in the topology. This is displayed in the Image drop down in the Router details box. Right now it is hardcoded, any changes to the images will need to be made here. */
  const imageOptions = [
    { value: "arista_ceos:4.35.1F", label: "4.35.1F", kind: "ceos" },
    { value: "sonic-vm:202411", label: "sonic:202411", kind: "sonic-vm" },
    { value: "alpine", label: "Alpine", kind: "linux" }
  ];

  /* This is the list of kinds that can be used for the nodes in the topology. This is displayed in the Kind drop down in the Router details box. Right now it is hardcoded, any changes to the kinds will need to be made here. */
  const kindOptions = [
    { value: "ceos", label: "cEOS" },
    { value: "sonic-vm", label: "sonic" },
    { value: "linux", label: "Linux" },
  ];

  const getFilteredImageOptions = () => {
    if (!nodeKind) return [];
    return imageOptions.filter(option => option.kind === nodeKind);
  };

  /* This is the list of servers that can be used for the deployment of the topology. Again this is hardcoded, any changes to the servers will need to be made here. This is displayed in the Server table after you click on deploy */
  const serverOptions = [
    { value: "10.83.12.237", label: "10.83.12.237" }
  ];

  // const handleModeChange = (newMode) => {
  //   setMode(newMode);
  //   setNodes([]);
  //   setEdges([]);
  //   setYamlOutput('');
  // };

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
        setNodeName("");
        setNodeBinds([""]);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const getNextInterfaceNumber = (nodeId) => {
    const usedInterfaces = nodeInterfaces[nodeId] || [];
    let nextNumber = 1;
    while (usedInterfaces.includes(`eth${nextNumber}`)) {
      nextNumber++;
    }
    return nextNumber;
  };

  /* This is the function to update the node interfaces. It is used to update the node interfaces when a new edge is created. */
  const updateNodeInterfaces = (sourceId, targetId, sourceInterface, targetInterface) => {
    setNodeInterfaces(prev => ({
      ...prev,
      [sourceId]: [...(prev[sourceId] || []), sourceInterface],
      [targetId]: [...(prev[targetId] || []), targetInterface]
    }));
  };

  // Handle "Connect" context menu action: right-click node A -> Connect -> click node B
  const handleConnectNode = useCallback(() => {
    setConnectSourceNode(contextMenu.element);
    setContextMenu(null);
  }, [contextMenu]);

  const onNodeTap = useCallback(
    (nodeData) => {
      if (connectSourceNode && nodeData.id !== connectSourceNode.id) {

        const sourceNode = nodes.find((n) => n.id === connectSourceNode.id);
        const targetNode = nodes.find((n) => n.id === nodeData.id);
        if (!sourceNode || !targetNode) {
          setConnectSourceNode(null);
          return;
        }

        const sourceInterfaceNumber = getNextInterfaceNumber(connectSourceNode.id);
        const targetInterfaceNumber = getNextInterfaceNumber(nodeData.id);

        setNewEdgeData({
          source: connectSourceNode.id,
          target: nodeData.id,
          sourceNodeName: sourceNode.data.label,
          targetNodeName: targetNode.data.label,
          sourceInterface: `eth${sourceInterfaceNumber}`,
          targetInterface: `eth${targetInterfaceNumber}`,
        });
        setSourceInterface(`eth${sourceInterfaceNumber}`);
        setTargetInterface(`eth${targetInterfaceNumber}`);
        setIsEdgeModalOpen(true);
        setConnectSourceNode(null);
      }
    },
    [connectSourceNode, nodes, nodeInterfaces]
  );

  /* This is the function to validate the topology name. It is used to check if the topology name is empty. */
  const validateTopologyName = () => {
    if (!topologyName.trim()) {
      setShowWarning(true);
      return false;
    }
    return true;
  };

  /* This is the function to handle the drop event. It is used to create a new node when a node is dropped on the canvas. */
  const onDrop = useCallback(
    (event) => {
      if (!topologyName.trim()) {
        const newName = generateRandomName();
        setTopologyName(newName);
        // Update the YAML with the new name
        const updatedYaml = yamlOutput.replace(/name:.*/, `name: ${newName}`);
        setYamlOutput(updatedYaml);
      }
      event.preventDefault();

      const type = event.dataTransfer.getData("application/reactflow");

      if (!type) return;

      // Convert screen coordinates to Cytoscape model coordinates
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
        id: getId(),
        position,
        data: { label: `${type} node` }
      };

      setNewNode(newNode);
      setIsModalOpen(true);
      setModalType("create"); // Set to create mode
      
      // Set default values based on node type
      if (type === 'router') {
        setNodeNamePrefix('ceos');
        setNodeKind('ceos');
        setNodeImage('arista_ceos:4.35.1F');
      } else if (type === 'server') {
        setNodeNamePrefix('host');
        setNodeKind('linux');
        setNodeImage('alpine');
      }
      
      setNodeCount(1);
      setNodeBinds([""]);
      setNodeModalWarning(false);
      setNodeCustomFields([{ key: '', value: '' }]);
    },
    [nodes, edges, topologyName, yamlOutput]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  /* This is the function to handle the removal of elements from the topology. It is used to remove a node or an edge from the topology. */
  const onElementsRemove = useCallback(
    (elementsToRemove) => {
      const removeIds = new Set(elementsToRemove.map(el => el.id));
      const updatedNodes = nodes.filter(n => !removeIds.has(n.id));
      const updatedEdges = edges.filter(e => !removeIds.has(e.id));
      setNodes(updatedNodes);
      setEdges(updatedEdges);
      updateYaml(updatedNodes, updatedEdges);
    },
    [nodes, edges]
  );

  /* This is the function to handle clicking on node buttons in the sidebar. It creates a node at the center of the canvas. */
  const onNodeClick = useCallback(
    (nodeType) => {
      if (!topologyName.trim()) {
        const newName = generateRandomName();
        setTopologyName(newName);
        // Update the YAML with the new name
        const updatedYaml = yamlOutput.replace(/name:.*/, `name: ${newName}`);
        setYamlOutput(updatedYaml);
      }

      // Create node at center of canvas (approximate center position)
      const position = {
        x: 400, // Default center-ish position
        y: 200,
      };

      const newNode = {
        id: getId(),
        position,
        data: { label: `${nodeType} node`, nodeType: nodeType }
      };

      setNewNode(newNode);
      setIsModalOpen(true);
      setModalType("create"); // Set to create mode
      
      // Set default values based on node type
      if (nodeType === 'router') {
        setNodeNamePrefix('ceos');
        setNodeKind('ceos');
        setNodeImage('arista_ceos:4.35.1F');
      } else if (nodeType === 'bridge') {
        setNodeNamePrefix('bridge');
        setNodeKind('linux');
        setNodeImage('alpine');
      } else if (nodeType === 'linux-host') {
        setNodeNamePrefix('linux');
        setNodeKind('linux');
        setNodeImage('alpine');
      } else if (nodeType === 'container') {
        setNodeNamePrefix('container');
        setNodeKind('linux');
        setNodeImage('alpine');
      }
      
      setNodeCount(1);
      setNodeBinds([""]);
      setNodeModalWarning(false);
      setNodeCustomFields([{ key: '', value: '' }]);
    },
    [yamlOutput, topologyName]
  );

  /* Helper function to check if number is even */
  const isEvenNumber = (numStr) => {
    const num = parseInt(numStr);
    return !isNaN(num) && num > 0 && num % 2 === 0;
  };

  /* Handler for Generate button click */
  const onGenerateClick = useCallback(() => {
    setNumberOfTiers('2');
    setNumberOfSpines('');
    setNumberOfLeafs('');
    setNumberOfSuperSpines('');
    setGenerateEosVersionError('');
    setGenerateSuperSpinesError('');
    setGenerateSpinesError('');
    setGenerateLeafsError('');
    setSpinesInMlag(false);
    setLeafsInMlag(false);
    setAddHosts(false);
    setNumberOfHosts('');
    setHostsError('');
    setHostParents({});
    setHostParentErrors({});
    setUseDefaultPrefix(true);
    setTier1Prefix('');
    setTier2Prefix('');
    setTier3Prefix('');
    setTierPrefixErrors({});
    setAddStartupConfig(false);
    setApplyStartupConfigToAll(true);
    setGenerateStartupConfigPath('');
    setGenerateStartupConfigError('');
    setSelectedDevicesForStartupConfig({ superSpines: [], spines: [], leafs: [], hosts: [] });
    setAddBinds(false);
    setApplyBindsToAll(true);
    setGenerateBinds([{ source: '', target: '' }]);
    setGenerateBindsErrors([]);
    setSelectedDevicesForBinds({ superSpines: [], spines: [], leafs: [], hosts: [] });
    const ceosOptions = imageOptions.filter(option => option.kind === 'ceos');
    setGenerateEosVersion(ceosOptions[0] ? ceosOptions[0].value : 'arista_ceos:4.35.1F');
    setIsGenerateModalOpen(true);
  }, [imageOptions]);

  /* Validation handlers for Generate modal inputs */
  const handleSuperSpinesChange = (e) => {
    const value = e.target.value;
    setNumberOfSuperSpines(value);
    const num = parseInt(value);
    if (value && (isNaN(num) || num < 1)) {
      setGenerateSuperSpinesError('Please enter a valid number (minimum 1)');
    } else if (num > 8) {
      setGenerateSuperSpinesError('Maximum number of super spines is 8');
    } else {
      setGenerateSuperSpinesError('');
    }
  };

  const handleSpinesChange = (e) => {
    const value = e.target.value;
    setNumberOfSpines(value);
    const num = parseInt(value);
    if (value && (isNaN(num) || num < 1)) {
      setGenerateSpinesError('Please enter a valid number (minimum 1)');
    } else if (num > 16) {
      setGenerateSpinesError('Maximum number of spines is 16');
    } else {
      setGenerateSpinesError('');
    }
    if (!isEvenNumber(value)) setSpinesInMlag(false);
  };

  const handleLeafsChange = (e) => {
    const value = e.target.value;
    setNumberOfLeafs(value);
    const num = parseInt(value);
    if (value && (isNaN(num) || num < 1)) {
      setGenerateLeafsError('Please enter a valid number (minimum 1)');
    } else if (num > 32) {
      setGenerateLeafsError('Maximum number of leafs is 32');
    } else {
      setGenerateLeafsError('');
    }
    if (!isEvenNumber(value)) setLeafsInMlag(false);
    if (!(num > 0)) {
      setAddHosts(false);
      setNumberOfHosts('');
      setHostParents({});
      setHostsError('');
      setHostParentErrors({});
    }
    if (addHosts && Object.keys(hostParents).length > 0 && num > 0) {
      const newHostParents = {};
      Object.entries(hostParents).forEach(([hostName, parents]) => {
        newHostParents[hostName] = parents.filter(p => {
          const leafNum = parseInt(p.replace('leaf', ''));
          return leafNum <= num;
        });
      });
      setHostParents(newHostParents);
    }
  };

  const handleHostsChange = (e) => {
    const value = e.target.value;
    setNumberOfHosts(value);
    const num = parseInt(value);
    if (value && (isNaN(num) || num < 1)) {
      setHostsError('Please enter a valid number (minimum 1)');
    } else if (num > 32) {
      setHostsError('Maximum number of hosts is 32');
    } else {
      setHostsError('');
    }
    if (num > 0) {
      const newHostParents = {};
      for (let i = 1; i <= num; i++) {
        const hostName = `host${i}`;
        newHostParents[hostName] = hostParents[hostName] || [];
      }
      setHostParents(newHostParents);
      setHostParentErrors({});
    } else {
      setHostParents({});
      setHostParentErrors({});
    }
  };

  const handleHostParentChange = (hostName, event) => {
    const selectedOptions = Array.from(event.target.selectedOptions, option => option.value);
    setHostParents(prev => ({ ...prev, [hostName]: selectedOptions }));
    if (selectedOptions.length > 0) {
      setHostParentErrors(prev => { const n = {...prev}; delete n[hostName]; return n; });
    }
  };

  const hasAnyDevices = () => {
    const spines = parseInt(numberOfSpines) || 0;
    const leafs = parseInt(numberOfLeafs) || 0;
    const superSpines = numberOfTiers === '3' ? (parseInt(numberOfSuperSpines) || 0) : 0;
    return spines > 0 || leafs > 0 || superSpines > 0;
  };

  const areAllDevicesSelected = (tier, count, prefix) => {
    const currentSelected = selectedDevicesForStartupConfig[tier] || [];
    if (currentSelected.length !== count) return false;
    for (let i = 1; i <= count; i++) {
      if (!currentSelected.includes(`${prefix}${i}`)) return false;
    }
    return true;
  };

  const handleSelectAllTier = (tier, count, prefix) => {
    const allSelected = areAllDevicesSelected(tier, count, prefix);
    if (allSelected) {
      setSelectedDevicesForStartupConfig(prev => ({ ...prev, [tier]: [] }));
    } else {
      const allDevices = [];
      for (let i = 1; i <= count; i++) allDevices.push(`${prefix}${i}`);
      setSelectedDevicesForStartupConfig(prev => ({ ...prev, [tier]: allDevices }));
    }
  };

  const handleDeviceToggleForStartupConfig = (tier, deviceName) => {
    setSelectedDevicesForStartupConfig(prev => {
      const current = prev[tier] || [];
      const isSelected = current.includes(deviceName);
      return { ...prev, [tier]: isSelected ? current.filter(d => d !== deviceName) : [...current, deviceName] };
    });
  };

  const capitalizeFirstLetter = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const getTierDisplayLabel = (tierType) => {
    if (useDefaultPrefix) {
      if (tierType === 'superspine') return 'Super Spines';
      if (tierType === 'spine') return 'Spines';
      if (tierType === 'leaf') return 'Leafs';
    } else {
      if (tierType === 'superspine' && tier1Prefix.trim()) return capitalizeFirstLetter(tier1Prefix.trim());
      if (tierType === 'spine') {
        const prefix = numberOfTiers === '3' ? tier2Prefix : tier1Prefix;
        return prefix.trim() ? capitalizeFirstLetter(prefix.trim()) : 'Spines';
      }
      if (tierType === 'leaf') {
        const prefix = numberOfTiers === '3' ? tier3Prefix : tier2Prefix;
        return prefix.trim() ? capitalizeFirstLetter(prefix.trim()) : 'Leafs';
      }
    }
    if (tierType === 'superspine') return 'Super Spines';
    if (tierType === 'spine') return 'Spines';
    return 'Leafs';
  };

  const validatePrefix = (prefix) => {
    if (!prefix || prefix.trim() === '') return 'Prefix is required';
    if (!/^[a-zA-Z]/.test(prefix)) return 'Prefix must start with a letter';
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(prefix)) return 'Only letters, numbers and hyphens allowed';
    if (prefix.length > 20) return 'Prefix must be 20 characters or less';
    return null;
  };

  const handleTierPrefixChange = (tier, value) => {
    if (tier === 'tier1') setTier1Prefix(value);
    else if (tier === 'tier2') setTier2Prefix(value);
    else if (tier === 'tier3') setTier3Prefix(value);
    const error = validatePrefix(value);
    setTierPrefixErrors(prev => {
      const n = {...prev};
      if (error) n[tier] = error; else delete n[tier];
      return n;
    });
  };

  const handleAddGenerateBind = () => {
    setGenerateBinds([...generateBinds, { source: '', target: '' }]);
    setGenerateBindsErrors([...generateBindsErrors, { source: '', target: '' }]);
  };

  const handleRemoveGenerateBind = (index) => {
    const newBinds = [...generateBinds]; newBinds.splice(index, 1); setGenerateBinds(newBinds);
    const newErrors = [...generateBindsErrors]; newErrors.splice(index, 1); setGenerateBindsErrors(newErrors);
  };

  const handleGenerateBindChange = (index, field, value) => {
    const newBinds = [...generateBinds]; newBinds[index][field] = value; setGenerateBinds(newBinds);
    const newErrors = [...generateBindsErrors];
    if (!newErrors[index]) newErrors[index] = { source: '', target: '' };
    newErrors[index][field] = value.trim() === '' ? `${field === 'source' ? 'Source' : 'Target'} path is required` : '';
    setGenerateBindsErrors(newErrors);
  };

  const handleDeviceToggleForBinds = (tier, deviceName) => {
    setSelectedDevicesForBinds(prev => {
      const current = prev[tier] || [];
      const isSelected = current.includes(deviceName);
      return { ...prev, [tier]: isSelected ? current.filter(n => n !== deviceName) : [...current, deviceName] };
    });
  };

  const handleSelectAllTierForBinds = (tier, count, prefix) => {
    const allDevices = Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
    const current = selectedDevicesForBinds[tier] || [];
    const allSelected = allDevices.every(d => current.includes(d));
    setSelectedDevicesForBinds(prev => ({ ...prev, [tier]: allSelected ? [] : allDevices }));
  };

  const areAllDevicesSelectedForBinds = (tier, count, prefix) => {
    const allDevices = Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
    const current = selectedDevicesForBinds[tier] || [];
    return allDevices.length > 0 && allDevices.every(d => current.includes(d));
  };

  /* Generate YAML for topology based on tier configuration */
  const generateTopologyYaml = (tiers, superSpines, spines, leafs, eosVersion, spinesInMlagVal, leafsInMlagVal, hosts, hostParentsVal, useDefaultPrefixVal, customPrefixes) => {
    const yamlObject = { name: generateRandomName(), topology: { nodes: {}, links: [] } };
    let superSpinePrefix, spinePrefix, leafPrefix;
    if (useDefaultPrefixVal) {
      if (tiers === '3') { superSpinePrefix = 'superspine'; spinePrefix = 'spine'; leafPrefix = 'leaf'; }
      else { spinePrefix = 'spine'; leafPrefix = 'leaf'; }
    } else {
      if (tiers === '3') { superSpinePrefix = customPrefixes.tier1; spinePrefix = customPrefixes.tier2; leafPrefix = customPrefixes.tier3; }
      else { spinePrefix = customPrefixes.tier1; leafPrefix = customPrefixes.tier2; }
    }
    const interfaceCounters = {};
    const getNextInterface = (nodeName) => {
      if (!interfaceCounters[nodeName]) interfaceCounters[nodeName] = 1;
      return `eth${interfaceCounters[nodeName]++}`;
    };
    const shouldAddStartupConfigFn = (nodeName, nodeType) => {
      if (!addStartupConfig) return false;
      if (applyStartupConfigToAll) return true;
      return selectedDevicesForStartupConfig[nodeType]?.includes(nodeName) || false;
    };
    const shouldAddBindsFn = (nodeName, nodeType) => {
      if (!addBinds) return false;
      if (applyBindsToAll) return true;
      return selectedDevicesForBinds[nodeType]?.includes(nodeName) || false;
    };
    const createNode = (nodeName, nodeType) => {
      yamlObject.topology.nodes[nodeName] = { kind: "ceos", image: eosVersion };
      if (shouldAddStartupConfigFn(nodeName, nodeType)) {
        yamlObject.topology.nodes[nodeName]['startup-config'] = generateStartupConfigPath;
      }
      if (shouldAddBindsFn(nodeName, nodeType)) {
        yamlObject.topology.nodes[nodeName].binds = generateBinds
          .filter(b => b.source && b.target).map(b => `${b.source}:${b.target}`);
      }
    };
    // Create nodes
    if (tiers === '3') {
      for (let i = 1; i <= superSpines; i++) createNode(`${superSpinePrefix}${i}`, 'superSpines');
    }
    for (let i = 1; i <= spines; i++) createNode(`${spinePrefix}${i}`, 'spines');
    for (let i = 1; i <= leafs; i++) createNode(`${leafPrefix}${i}`, 'leafs');
    if (hosts > 0) {
      for (let i = 1; i <= hosts; i++) createNode(`host${i}`, 'hosts');
    }
    // Create links - full mesh
    if (tiers === '3') {
      for (let i = 1; i <= superSpines; i++) {
        for (let j = 1; j <= spines; j++) {
          const ss = `${superSpinePrefix}${i}`, sp = `${spinePrefix}${j}`;
          yamlObject.topology.links.push({ endpoints: [`${ss}:${getNextInterface(ss)}`, `${sp}:${getNextInterface(sp)}`] });
        }
      }
    }
    for (let i = 1; i <= spines; i++) {
      for (let j = 1; j <= leafs; j++) {
        const sp = `${spinePrefix}${i}`, lf = `${leafPrefix}${j}`;
        yamlObject.topology.links.push({ endpoints: [`${sp}:${getNextInterface(sp)}`, `${lf}:${getNextInterface(lf)}`] });
      }
    }
    // MLAG links
    if (spinesInMlagVal && spines % 2 === 0) {
      for (let i = 1; i <= spines; i += 2) {
        const s1 = `${spinePrefix}${i}`, s2 = `${spinePrefix}${i + 1}`;
        yamlObject.topology.links.push({ endpoints: [`${s1}:${getNextInterface(s1)}`, `${s2}:${getNextInterface(s2)}`] });
        yamlObject.topology.links.push({ endpoints: [`${s1}:${getNextInterface(s1)}`, `${s2}:${getNextInterface(s2)}`] });
      }
    }
    if (leafsInMlagVal && leafs % 2 === 0) {
      for (let i = 1; i <= leafs; i += 2) {
        const l1 = `${leafPrefix}${i}`, l2 = `${leafPrefix}${i + 1}`;
        yamlObject.topology.links.push({ endpoints: [`${l1}:${getNextInterface(l1)}`, `${l2}:${getNextInterface(l2)}`] });
        yamlObject.topology.links.push({ endpoints: [`${l1}:${getNextInterface(l1)}`, `${l2}:${getNextInterface(l2)}`] });
      }
    }
    // Host to leaf links
    if (hosts > 0 && hostParentsVal) {
      Object.entries(hostParentsVal).forEach(([hostName, parentLeafs]) => {
        parentLeafs.forEach(leafName => {
          yamlObject.topology.links.push({ endpoints: [`${hostName}:${getNextInterface(hostName)}`, `${leafName}:${getNextInterface(leafName)}`] });
        });
      });
    }
    return yaml.dump(yamlObject, { lineWidth: -1, quotingType: '"', forceQuotes: true });
  };

  /* Handler for Generate modal submit */
  const handleGenerateSubmit = () => {
    if (generateEosVersionError || generateSuperSpinesError || generateSpinesError || generateLeafsError || hostsError || generateStartupConfigError) return;
    if (!generateEosVersion || generateEosVersion === '') { setGenerateEosVersionError('Please select an EOS version'); return; }
    const spines = parseInt(numberOfSpines) || 0;
    const leafs = parseInt(numberOfLeafs) || 0;
    const superSpines = numberOfTiers === '3' ? (parseInt(numberOfSuperSpines) || 0) : 0;
    if (spines === 0) { setGenerateSpinesError('Please enter number of spines'); return; }
    if (leafs === 0) { setGenerateLeafsError('Please enter number of leafs'); return; }
    if (numberOfTiers === '3' && superSpines === 0) { setGenerateSuperSpinesError('Please enter number of super spines'); return; }
    if (addHosts) {
      const hosts = parseInt(numberOfHosts) || 0;
      if (hosts === 0) { setHostsError('Please enter number of hosts'); return; }
      let hasErrors = false;
      const newErrors = {};
      for (let i = 1; i <= hosts; i++) {
        const hostName = `host${i}`;
        if (!(hostParents[hostName]?.length > 0)) { newErrors[hostName] = 'Select at least one parent leaf'; hasErrors = true; }
      }
      if (hasErrors) { setHostParentErrors(newErrors); return; }
    }
    if (!useDefaultPrefix) {
      let hasErrors = false;
      const newErrors = {};
      const t1Err = validatePrefix(tier1Prefix); if (t1Err) { newErrors.tier1 = t1Err; hasErrors = true; }
      const t2Err = validatePrefix(tier2Prefix); if (t2Err) { newErrors.tier2 = t2Err; hasErrors = true; }
      if (numberOfTiers === '3') { const t3Err = validatePrefix(tier3Prefix); if (t3Err) { newErrors.tier3 = t3Err; hasErrors = true; } }
      if (hasErrors) { setTierPrefixErrors(newErrors); return; }
    }
    if (addStartupConfig) {
      if (!generateStartupConfigPath || generateStartupConfigPath.trim() === '') { setGenerateStartupConfigError('Please enter a startup config path'); return; }
      if (!applyStartupConfigToAll) {
        const total = (selectedDevicesForStartupConfig.superSpines?.length || 0) + (selectedDevicesForStartupConfig.spines?.length || 0) + (selectedDevicesForStartupConfig.leafs?.length || 0) + (selectedDevicesForStartupConfig.hosts?.length || 0);
        if (total === 0) { setGenerateStartupConfigError('Please select at least one device'); return; }
      }
    }
    if (addBinds) {
      const newBindErrors = generateBinds.map(b => ({ source: b.source.trim() === '' ? 'Source path is required' : '', target: b.target.trim() === '' ? 'Target path is required' : '' }));
      setGenerateBindsErrors(newBindErrors);
      if (newBindErrors.some(e => e.source || e.target)) return;
      if (!applyBindsToAll) {
        const total = (selectedDevicesForBinds.superSpines?.length || 0) + (selectedDevicesForBinds.spines?.length || 0) + (selectedDevicesForBinds.leafs?.length || 0) + (selectedDevicesForBinds.hosts?.length || 0);
        if (total === 0) { alert('Please select at least one device for binds'); return; }
      }
    }
    try {
      const generatedYaml = generateTopologyYaml(numberOfTiers, superSpines, spines, leafs, generateEosVersion, spinesInMlag, leafsInMlag, addHosts ? (parseInt(numberOfHosts) || 0) : 0, hostParents, useDefaultPrefix, { tier1: tier1Prefix, tier2: tier2Prefix, tier3: tier3Prefix });
      handleYamlChange(generatedYaml);
      setIsGenerateModalOpen(false);
    } catch (error) {
      console.error('Error generating topology:', error);
      alert(`Error generating topology: ${error.message}`);
    }
  };

  const handleGenerateClose = () => { setIsGenerateModalOpen(false); };

  /* This is the function to update the YAML output of the topology. It is used to update the YAML output of the topology when a node or an edge is added or removed. */
  const updateYaml = (updatedNodes, updatedEdges) => {
    // If there are no nodes and no topology name, return empty YAML
    if (
      updatedNodes.length === 0 &&
      topologyName === ""
    ) {
      setYamlOutput("");
      setEditableYaml("");
      return;
    }

    // Try to parse existing YAML to preserve any existing configuration
    let existingConfig = {};
    try {
      existingConfig = yaml.load(yamlOutput) || {};
    } catch (error) {
      console.warn('Could not parse existing YAML:', error);
    }

    
    const yamlObject = {
      name: topologyName.includes(user?.username) ? topologyName : `${user?.username || ''}-${topologyName}`,
      topology: {
        nodes: {},
      },
    };

   
    updatedNodes.forEach((node) => {
      const nodeKey = node.id || node.data.label;
      const existingNode = existingConfig?.topology?.nodes?.[nodeKey] || {};
      yamlObject.topology.nodes[nodeKey] = {
        ...existingNode, 
        kind: node.data.kind || existingNode.kind,
        image: node.data.image || existingNode.image,
      };

      if (node.data.binds?.length > 0) {
        const validBinds = node.data.binds
          .filter(bind => bind.source && bind.target)
          .map(bind => `${bind.source}:${bind.target}`);
        if (validBinds.length > 0) {
          yamlObject.topology.nodes[nodeKey].binds = validBinds;
        }
      } else if (existingNode.binds) {
        yamlObject.topology.nodes[nodeKey].binds = existingNode.binds;
      }

      if (node.data.startupConfig && node.data.startupConfig.trim() !== '') {
        yamlObject.topology.nodes[nodeKey]['startup-config'] = node.data.startupConfig;
      }

      // Add custom fields under an 'env' key
      if (node.data.customFields && node.data.customFields.some(field => field.key && field.value)) {
        yamlObject.topology.nodes[nodeKey].env = {};
        node.data.customFields.forEach(({ key, value }) => {
          if (key && value) {
            yamlObject.topology.nodes[nodeKey].env[key] = value;
          }
        });
      }
    });

    
    if (updatedEdges.length > 0) {
      yamlObject.topology.links = updatedEdges.map((edge) => {
        return {
          endpoints: [
            `${edge.source}:${edge.data?.sourceInterface || 'eth1'}`,
            `${edge.target}:${edge.data?.targetInterface || 'eth1'}`
          ]
        };
      });
    }

    const yamlString = yaml.dump(yamlObject, { 
      lineWidth: -1,  // Don't wrap long lines
      quotingType: '"',  // Use double quotes for strings
      forceQuotes: true  // Force quotes around all strings
    });
    setYamlOutput(yamlString);
    setEditableYaml(yamlString);
    
    // Update context with new YAML
    updateTopologyState({
      yamlOutput: yamlString,
      editableYaml: yamlString
    });
  };
  
  /* This is the function to handle the change in the topology name. It is used to update the YAML output of the topology when the topology name is changed. */
  const handleTopologyNameChange = (event) => {
    const newTopologyName = event.target.value;
    setTopologyName(newTopologyName);
    
    const yamlData = {
      name: `${user?.username || ''}-${newTopologyName}`,
      topology: {
        nodes: nodes.reduce((acc, node) => {
          const nodeConfig = {};
          if (node.data.kind?.trim()) nodeConfig.kind = node.data.kind;
          if (node.data.image?.trim()) nodeConfig.image = node.data.image;
          if (node.data.binds?.some(bind => bind.trim())) {
            nodeConfig.binds = node.data.binds.filter(bind => bind.trim());
          }
          if (node.data.startupConfig?.trim()) nodeConfig['startup-config'] = node.data.startupConfig;
          
          acc[node.data.label] = nodeConfig;
          return acc;
        }, {}),
        links: edges.map((edge) => ({
          endpoints: [
            `${nodes.find(n => n.id === edge.source).data.label}:${edge.data.sourceInterface}`,
            `${nodes.find(n => n.id === edge.target).data.label}:${edge.data.targetInterface}`
          ]
        }))
      }
    };

    const generatedYaml = yaml.dump(yamlData, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: true
    });
    setYamlOutput(generatedYaml);
    setEditableYaml(generatedYaml);
    
    // Update context with new YAML
    updateTopologyState({
      yamlOutput: generatedYaml,
      editableYaml: generatedYaml
    });
  };

  /* This is the function to handle the change in the node name. It is used to update the YAML output of the topology when the node name is changed. */
  const handleNodeNameChange = (event) => {
    setNodeName(event.target.value);
  };

  /* This is the function to handle the change in the node binds. It is used to update the YAML output of the topology when the node binds are changed. */
  const handleNodeBindsChange = (index, field, value) => {
    const newBinds = [...nodeBinds];
    newBinds[index] = {
      ...newBinds[index],
      [field]: value
    };
    setNodeBinds(newBinds);
  };

  /* This is the function to handle the addition of a new bind node. It is used to add a new bind node to the topology. */
  const handleAddBindNode = () => {
    setNodeBinds([...nodeBinds, { source: '', target: '' }]);
  };

  /* This is the function to handle the change in the node kind. It is used to update the YAML output of the topology when the node kind is changed. */
  const handleNodeKindChange = (event) => {
    setNodeKind(event.target.value);
  };

  /* This is the function to handle the change in the node image. It is used to update the YAML output of the topology when the node image is changed. */
  const handleNodeImageChange = (event) => {
    setNodeImage(event.target.value);
  };

  /* This is the function to handle the change in the node startup config. It is used to update the YAML output of the topology when the node startup config is changed. */
  const handleNodeStartupConfigChange = (event) => {
    setNodeStartupConfig(event.target.value);
  };

  /* This is the function to handle the browse of the startup config. It is used to browse the startup config file for the node. */
  const handleBrowseStartupConfig = () => {
    setShowFileManagerForStartupConfig(true);
  };

  /* This is the function to handle the selection of the startup config file. It is used to select the startup config file for the node. */
  const handleFileManagerStartupConfigSelect = (content, selectedPath) => {
    // We just need the file path, not the content
    if (selectedPath && selectedPath.path) {
      console.log('Selected startup config path:', selectedPath.path);
      setNodeStartupConfig(selectedPath.path);
    }
    setShowFileManagerForStartupConfig(false);
  };

  /* This is the function to initialize the node interfaces. It is used to initialize the node interfaces when a new node is created. */
  const initializeNodeInterfaces = (nodeId) => {
    setNodeInterfaces(prev => ({
      ...prev,
      [nodeId]: []
    }));
  };

  /* This is the function to handle the submission of the modal. It is used to submit the modal when a node is modified. */
  const handleModalSubmit = () => {
    if (modalType === "modify") {
      if (!nodeName.trim() || !nodeKind.trim()) {
        setNodeModalWarning(true);
        return;
      }
      const oldNodeId = newNode.id;
      const wasNameChanged = nodeName !== newNode.data.label;
      const updatedNodeId = wasNameChanged ? nodeName : oldNodeId;
      const updatedNode = {
        ...newNode,
        id: updatedNodeId,
        data: {
          ...newNode.data,
          label: nodeName,
          kind: nodeKind,
          image: nodeImage,
          binds: nodeBinds,
          startupConfig: nodeStartupConfig,
          customFields: nodeCustomFields,
          ...(Object.fromEntries(nodeCustomFields.filter(f => f.key && f.value).map(f => [f.key, f.value])))
        },
      };
      const updatedNodes = nodes.map((node) => node.id === oldNodeId ? updatedNode : node);
      let updatedEdges = edges;
      if (wasNameChanged) {
        updatedEdges = edges.map((edge) => {
          if (edge.source === oldNodeId) {
            return { ...edge, source: updatedNodeId };
          }
          if (edge.target === oldNodeId) {
            return { ...edge, target: updatedNodeId };
          }
          return edge;
        });
      }
      updateYaml(updatedNodes, updatedEdges);
      setNodes(updatedNodes);
      if (wasNameChanged) {
        setEdges(updatedEdges);
        if (nodeInterfaces[oldNodeId]) {
          setNodeInterfaces(prev => {
            const updatedInterfaces = { ...prev };
            updatedInterfaces[updatedNodeId] = updatedInterfaces[oldNodeId];
            delete updatedInterfaces[oldNodeId];
            return updatedInterfaces;
          });
        }
      }
      setShowModifyNodeModal(false);
      setIsModifying(false);
      setNodeModalWarning(false);
      setIsModalOpen(false);
      return;
    }
    if (!nodeNamePrefix.trim() || !nodeKind.trim()) {
      setNodeModalWarning(true);
      return;
    }

    // Find the highest node number for this prefix to ensure no duplicates
    let highestNodeNum = 0;
    const nodeRegex = new RegExp(`^${nodeNamePrefix}(\\d+)$`);
    
    nodes.forEach(node => {
      const match = node.data.label.match(nodeRegex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > highestNodeNum) {
          highestNodeNum = num;
        }
      }
    });

    let newNodesAdded = [];

    if (nodeCount === 1) {
      // Single node creation
      const finalNodeName = nodeName.trim() || `${nodeNamePrefix}${highestNodeNum + 1}`;
      
      const newNodeWithData = {
        ...newNode,
        id: finalNodeName, // Use the node name as ID for better YAML mapping
        data: {
          ...newNode.data,
          label: finalNodeName,
          kind: nodeKind,
          image: nodeImage,
          binds: nodeBinds,
          startupConfig: nodeStartupConfig,
          customFields: nodeCustomFields,
          ...(Object.fromEntries(nodeCustomFields.filter(f => f.key && f.value).map(f => [f.key, f.value])))
        },
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
        initializeNodeInterfaces(newNodeWithData.id);
        newNodesAdded = [newNodeWithData];
      }
    } else {
      // Multiple nodes creation
      const startingNum = highestNodeNum + 1;
      const newNodesWithData = [];
      const basePosition = newNode.position;
      
      // Create multiple nodes with sequential names and positions in a grid layout
      for (let i = 0; i < nodeCount; i++) {
        const nodeNum = startingNum + i;
        const row = Math.floor(i / 4); // 4 nodes per row
        const col = i % 4;
        
        const finalNodeName = `${nodeNamePrefix}${nodeNum}`;

        const newNodeWithData = {
          ...newNode,
          id: finalNodeName, // Use the node name as ID for better YAML mapping
          position: {
            x: basePosition.x + col * 180, // Spread nodes horizontally
            y: basePosition.y + row * 150  // Spread nodes vertically
          },
            data: {
            ...newNode.data,
            label: finalNodeName,
            kind: nodeKind,
            image: nodeImage,
            binds: nodeBinds,
            startupConfig: nodeStartupConfig,
            customFields: nodeCustomFields,
            ...(Object.fromEntries(nodeCustomFields.filter(f => f.key && f.value).map(f => [f.key, f.value])))
          },
        };
        
        newNodesWithData.push(newNodeWithData);
        initializeNodeInterfaces(newNodeWithData.id);
      }

      setNodes((nds) => [...nds, ...newNodesWithData]);
      newNodesAdded = newNodesWithData;
    }

    // Critical fix: Create a single array with both existing and new nodes
    const allNodes = [...nodes, ...newNodesAdded];
    updateYaml(allNodes, edges);

    // Reset all states
    setIsModalOpen(false);
    setNodeName("");
    setNodeNamePrefix("");
    setNodeKind("ceos");
    setNodeImage("arista_ceos:4.35.1F");
    setNodeBinds([""]);
    setNodeModalWarning(false);
    setNodeCount(1);
    setNodeStartupConfig("");
    setShowOptionalSettings(false); // Collapse optional settings by default next time
  };

  /* This is the function to handle the cancellation of the modal. It is used to cancel the modal when a node is modified. */
  const handleModalCancel = () => {
    setIsModalOpen(false);
    setNodeName("");
    setNodeNamePrefix("");
    setNodeBinds([""]);
    setNodeCount(1);
    setNodeStartupConfig("");
    setShowOptionalSettings(false); // Collapse optional settings by default next time
  };

  /* This is the function to handle the download of the YAML file. It is used to download the YAML file of the topology. */
  const handleDownloadYaml = () => {
    const blob = new Blob([yamlOutput], { type: "text/yaml;charset=utf-8" });
    const fileName = topologyName.includes(user?.username) 
      ? `${topologyName}.yml` 
      : `${user?.username || ''}-${topologyName}.yml`;
    saveAs(blob, fileName);
  };

  /* This is the function to handle the deployment of the topology. It is used to deploy the topology to the containerlab server you selected. */
  const handleDeploy = async () => {
    try {
      if (!topologyName.trim()) {
        const newName = generateRandomName();
        setTopologyName(newName);
        // Update the YAML with the new name
        const updatedYaml = yamlOutput.replace(/name:.*/, `name: ${newName}`);
        setYamlOutput(updatedYaml);
      }
      
      setIsDeployModalOpen(true);
      // Fetch server resource information when opening the deploy modal
      fetchServerResources();
    } catch (error) {
      console.error('Error deploying topology:', error);
      alert(`Error deploying topology: ${error.message}`);
      setShowLogModal(false);
    }
  };

  // New function to fetch server resource information
  /* This is the function to fetch the server resource information. It is used to fetch the server resource information like CPU and memory when the deploy modal is opened. */
  const fetchServerResources = async () => {
    try {
      setIsLoadingServerResources(true);
      
      // Fetch resource data for each server
      const resources = {};
      const labExists = {};
      
      // Get the formatted topology name
      const formattedTopologyName = topologyName.trim() ? 
        (topologyName.includes(user?.username) ? topologyName : `${user?.username || ''}-${topologyName}`) : 
        '';
      
      for (const server of serverOptions) {
        // This is the API call to fetch the server resource information
        const response = await fetch(`http://${server.value}:3001/api/system/metrics`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            resources[server.value] = {
              cpu: data.metrics.cpu,
              memory: data.metrics.memory,
              availableMemory: data.metrics.availableMemory
            };
          } else {
            resources[server.value] = {
              cpu: 0,
              memory: 0,
              availableMemory: null
            };
          }
        } else {
          resources[server.value] = {
            cpu: 0,
            memory: 0,
            availableMemory: null
          };
        }
        
        // Check if the lab exists on this server (only if topology name is not empty)
        if (formattedTopologyName) {
          try {
            // First, we need to login to get an auth token using the proxy
            const loginResponse = await fetch(`/login`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                username: user?.username,
                password: 'ul678clab'
              })
            });
            
            if (loginResponse.ok) {
              const loginData = await loginResponse.json();
              const authToken = loginData.token;
              
              // Use the official containerlab API to check if the lab exists
              const inspectResponse = await fetch(
                `/api/v1/labs/${formattedTopologyName}`,
                {
                  headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                  }
                }
              );
              
              if (inspectResponse.status === 200) {
                // If we get a 200 status, the lab exists
                labExists[server.value] = true;
              } else if (inspectResponse.status === 404) {
                // If we get a 404 status, the lab doesn't exist
                labExists[server.value] = false;
              } else {
                // Any other status, assume the lab doesn't exist
                labExists[server.value] = false;
              }
              
              console.log(`Lab existence check for ${formattedTopologyName} on ${server.value}: ${labExists[server.value]}`);
            } else {
              console.error(`Could not login to check lab existence on ${server.value}`);
              labExists[server.value] = false;
            }
          } catch (error) {
            console.error(`Error checking lab existence on server ${server.value}:`, error);
            labExists[server.value] = false;
          }
        } else {
          // If no topology name, lab can't exist
          labExists[server.value] = false;
        }
      }
      
      setServerResources(resources);
      setLabExistsOnServer(labExists);
    } catch (error) {
      console.error('Error fetching server resources:', error);
    } finally {
      setIsLoadingServerResources(false);
    }
  };

  /* This is the function to set up the auto-refresh of the server resources when the deploy modal is open. */
  useEffect(() => {
    if (isDeployModalOpen) {
      // Fetch resources immediately when the modal opens
      fetchServerResources();
      
      // Set up interval to refresh every 5 seconds while modal is open
      const intervalId = setInterval(() => {
        fetchServerResources();
      }, 20000);
      
      // Clean up the interval when the modal closes
      return () => clearInterval(intervalId);
    }
  }, [isDeployModalOpen]);

  /* This is the function to handle reconfiguration of the topology on the containerlab server */
  const handleServerReconfigure = async (serverIp) => {
    try {
      // Verify that we have a topology name
      if (!topologyName.trim()) {
        setErrorMessage('Please provide a topology name before reconfiguring.');
        setShowErrorModal(true);
        return;
      }
      
      setReconfigureLoading(prev => ({ ...prev, [serverIp]: true }));
      setOperationTitle('Reconfiguring Topology');
      setShowLogModal(true);
      setOperationLogs('Starting reconfiguration...\n');
      
      // Get the topology name with proper formatting
      const formattedTopologyName = topologyName.includes(user?.username) 
        ? topologyName 
        : `${user?.username || ''}-${topologyName}`;
      
      setOperationLogs(prev => prev + `\nReconfiguring lab: ${formattedTopologyName}\n`);
      setOperationLogs(prev => prev + `\nNote: Reconfiguration will only work if this topology has been previously deployed to this server.\n`);
      
      // Step 1: Login to get the authentication token
      setOperationLogs(prev => prev + '\nLogging in to containerlab API...\n');
      
      // Use relative URL to leverage the proxy setting in package.json
      const loginResponse = await fetch(`/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: user?.username,
          password: 'ul678clab'
        })
      });

      if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status} ${loginResponse.statusText}`);
      }

      const loginData = await loginResponse.json();
      const authToken = loginData.token;

      setOperationLogs(prev => prev + 'Successfully logged in to containerlab API\n');
      setOperationLogs(prev => prev + '\nPreparing to reconfigure topology...\n');

      // Step 2: Parse the YAML to a JSON object for the API
      const topologyContentJson = yaml.load(yamlOutput);
      
      // Start a progress indicator to show reconfiguration is ongoing
      setOperationLogs(prev => prev + '\nReconfiguration in progress. This might take a few minutes...\n');
      
      // Set up a progress indicator that updates every 5 seconds
      const progressInterval = setInterval(() => {
        setOperationLogs(prev => prev + '• Still working on reconfiguration, please wait...\n');
      }, 5000);
      
      try {
        // Step 3: Send the topology to the containerlab API with reconfigure=true
        const deployResponse = await fetch(`/api/v1/labs?reconfigure=true`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          body: JSON.stringify({
            topologyContent: topologyContentJson
          })
        });
        
        // Clear the progress indicator once we get a response
        clearInterval(progressInterval);
        
        if (!deployResponse.ok) {
          const errorText = await deployResponse.text();
          throw new Error(`Reconfiguration failed: ${deployResponse.status} - ${errorText}`);
        }
        
        // Process the response here inside the try block
        const contentType = deployResponse.headers.get('content-type');
        let responseData;
        
        if (contentType && contentType.includes('application/json')) {
          responseData = await deployResponse.json();
          setOperationLogs(prev => prev + '\nReconfiguration completed successfully!\n');
          setOperationLogs(prev => prev + JSON.stringify(responseData, null, 2));
        } else {
          responseData = await deployResponse.text();
          setOperationLogs(prev => prev + '\nReconfiguration completed successfully!\n');
          setOperationLogs(prev => prev + responseData);
        }
        
        setDeploymentSuccess(true);
        return;
      } catch (error) {
        // Make sure to clear the interval if there's an error
        clearInterval(progressInterval);
        throw error;
      }
    } catch (error) {
      console.error('Error reconfiguring topology:', error);
      setOperationLogs(prev => prev + `\nError: ${error.message}`);
    } finally {
      setReconfigureLoading(prev => ({ ...prev, [serverIp]: false }));
    }
  };

  /* This is the function to handle the deployment of the topology to the containerlab server you selected. */
  const handleServerDeploy = async (serverIp) => {
    try {
      setDeployLoading(prev => ({ ...prev, [serverIp]: true }));
      setOperationTitle('Deploying Topology');
      setShowLogModal(true);
      setOperationLogs('Starting deployment...\n');

      // Parse the YAML once at the beginning
      let parsedYaml = yaml.load(yamlOutput);
      let yamlNeedsUpdate = false;

      // If auto-assign is enabled, create the sn directory and files. This is very important when you want to onboard devices to CVP.
      if (autoAssignMacSn[serverIp]) {
        setOperationLogs(prev => prev + '\nCreating sn directory and files for MAC & S/N...\n');
        
        const topologyName = parsedYaml.name;
        const nodes = Object.keys(parsedYaml.topology.nodes);
        
        // Create the sn directory
        const snDirPath = `/home/clab_nfs_share/containerlab_topologies/${user.username}/${topologyName}/sn`;
        try {
          const createDirResponse = await fetch(`http://${serverIp}:3001/api/files/createDirectory`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              serverIp,
              path: `/home/clab_nfs_share/containerlab_topologies/${user.username}/${topologyName}`,
              directoryName: 'sn',
              username: user.username
            })
          });
          
          if (!createDirResponse.ok) {
            throw new Error('Failed to create sn directory');
          }
          
          setOperationLogs(prev => prev + 'Created sn directory\n');
          
          // Create individual files for each node
          for (const nodeName of nodes) {
            // Generate serial number - remove dots from username and all special characters from both username and node name as this is not supported in Serial Number
            const username = user.username.split('.')[0];
            const cleanUsername = username.replace(/[^a-zA-Z0-9]/g, '');
            const cleanNodeName = nodeName.replace(/[^a-zA-Z0-9]/g, '');
            const serialNumber = `${cleanUsername.toUpperCase()}${cleanNodeName.toUpperCase()}`;
            
            // Generate MAC address using topology name characters and random numbers
            const topoChars = topologyName.replace(/[^a-f0-9]/gi, '').substring(0, 4);
            const randomHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
            const middleOctet = (topoChars || (randomHex() + randomHex())).padEnd(4, '0');
            const macAddress = `001c.${middleOctet}.${randomHex()}${randomHex()}`;
            
            const fileContent = `SERIALNUMBER=${serialNumber}\nSYSTEMMACADDR=${macAddress}`;

            // This is the API call to create the file on the containerlab server
            const createFileResponse = await fetch(`http://${serverIp}:3001/api/files/createFile`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                serverIp,
                path: snDirPath,
                fileName: `${nodeName}.txt`,
                content: fileContent,
                username: user.username
              })
            });
            
            if (!createFileResponse.ok) {
              throw new Error(`Failed to create file for node ${nodeName}`);
            }
            
            setOperationLogs(prev => prev + `Created file for ${nodeName}\n`);
            
            // Update the node's binds in the YAML. 
            if (!parsedYaml.topology.nodes[nodeName].binds) {
              parsedYaml.topology.nodes[nodeName].binds = [];
            }
            // This is the bind mount for the node. This is used to parse the startup config file from the containerlab server to the node.
            parsedYaml.topology.nodes[nodeName].binds = [
              `/home/clab_nfs_share/containerlab_topologies/${user.username}/${topologyName}/sn/${nodeName}.txt:/mnt/flash/ceos-config:ro`,
              ...parsedYaml.topology.nodes[nodeName].binds.filter(bind => !bind.includes('/mnt/flash/ceos-config:ro'))
            ];
            yamlNeedsUpdate = true;
          }
          
          if (yamlNeedsUpdate) {
            // Update the YAML output with the new binds
            const updatedYaml = yaml.dump(parsedYaml, {
              lineWidth: -1,
              quotingType: '"',
              forceQuotes: true
            });
            setYamlOutput(updatedYaml);
            setEditableYaml(updatedYaml);
            
            setOperationLogs(prev => prev + 'Updated YAML with bind mounts\n');
          }
        } catch (error) {
          throw new Error(`Failed to set up MAC & S/N: ${error.message}`);
        }
      }

      // Use the final YAML with all updates
      const finalYaml = yamlNeedsUpdate ? yaml.dump(parsedYaml, {
        lineWidth: -1,
        quotingType: '"',
        forceQuotes: true
      }) : yamlOutput;

      // Deploy using custom backend API
      setOperationLogs(prev => prev + '\nPreparing to deploy topology...\n');

      // Create a file from the YAML content for upload
      const formattedTopologyName = topologyName.includes(user?.username)
        ? topologyName
        : `${user?.username || ''}-${topologyName}`;
      const fileName = `${formattedTopologyName}.yaml`;
      const yamlBlob = new Blob([finalYaml], { type: 'application/x-yaml' });
      const yamlFile = new File([yamlBlob], fileName, { type: 'application/x-yaml' });

      // Create FormData for the file upload
      const formData = new FormData();
      formData.append('file', yamlFile);
      formData.append('serverIp', serverIp);
      formData.append('username', user?.username || '');

      setOperationLogs(prev => prev + `Uploading topology file: ${fileName}\n`);
      setOperationLogs(prev => prev + '\nDeployment in progress...\n');

      try {
        const deployResponse = await fetch(`http://${serverIp}:3001/api/containerlab/deploy`, {
          method: 'POST',
          body: formData
        });

        // Read the streaming response
        const reader = deployResponse.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          setOperationLogs(prev => prev + chunk);
        }

        // Check if the response indicates success
        if (fullResponse.includes('Operation completed successfully')) {
          setDeploymentSuccess(true);
        } else {
          // Try to parse the final JSON result from the stream
          const jsonMatch = fullResponse.match(/\{[^{}]*"success"\s*:\s*(true|false)[^{}]*\}/);
          if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            if (result.success) {
              setDeploymentSuccess(true);
            }
          }
        }
        return;
      } catch (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error deploying topology:', error);
      setOperationLogs(prev => prev + `\nError: ${error.message}`);
    } finally {
      setDeployLoading(prev => ({ ...prev, [serverIp]: false }));
    }
  };

  /* This is the function to handle deployment directly from a Git repository URL */
  /* Scan the git repo for topology files, then auto-deploy or show file selection */
  const handleGitDeploy = async () => {
    if (!gitRepoUrl.trim()) {
      alert('Please enter a valid Git repository URL');
      return;
    }

    if (!user?.username) {
      alert('User information not available. Please log in.');
      return;
    }

    const serverIp = serverOptions[0].value;
    setIsGitScanning(true);

    try {
      const response = await fetch(`http://${serverIp}:3001/api/containerlab/scan-git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gitRepoUrl: gitRepoUrl,
          username: user.username
        })
      });

      const result = await response.json();

      if (!result.success) {
        alert(result.error || 'Failed to scan repository');
        setIsGitScanning(false);
        return;
      }

      // Store scan results
      setGitClonedDir(result.clonedDir);
      setGitRepoName(result.repoName);
      setGitTopoFiles(result.topoFiles);

      if (result.topoFiles.length === 1) {
        // Single file: auto-deploy immediately
        setShowGitDeployModal(false);
        setIsGitScanning(false);
        executeGitDeploy(result.clonedDir, result.topoFiles[0]);
      } else {
        // Multiple files: show selection modal
        setShowGitDeployModal(false);
        setIsGitScanning(false);
        setSelectedTopoFile(result.topoFiles[0]);
        setShowTopoFileSelectModal(true);
      }

    } catch (error) {
      console.error('Error scanning Git repo:', error);
      alert(`Error scanning repository: ${error.message}`);
      setIsGitScanning(false);
    }
  };

  /* Called when user clicks "Deploy Selected" in the file selection modal */
  const handleTopoFileSelect = () => {
    if (!selectedTopoFile) {
      alert('Please select a topology file');
      return;
    }
    setShowTopoFileSelectModal(false);
    executeGitDeploy(gitClonedDir, selectedTopoFile);
  };

  /* Execute the actual git deployment with a specific pre-cloned dir and file */
  const executeGitDeploy = async (clonedDir, topoFile) => {
    const repoName = gitRepoUrl.split('/').pop().replace('.git', '');
    const serverIp = serverOptions[0].value;

    // Open the log modal
    setOperationTitle(`Git Deployment: ${repoName}`);
    setOperationLogs('Starting Git repository deployment...\n');
    setShowLogModal(true);
    setDeploymentSuccess(false);

    try {
      setOperationLogs(prev => prev + `Repository: ${gitRepoUrl}\n`);
      setOperationLogs(prev => prev + `Server: ${serverIp}\n`);
      setOperationLogs(prev => prev + `User: ${user.username}\n`);
      setOperationLogs(prev => prev + `Topology file: ${topoFile}\n\n`);

      const response = await fetch(`http://${serverIp}:3001/api/containerlab/deploy-git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gitRepoUrl: gitRepoUrl,
          username: user.username,
          clonedDir: clonedDir,
          selectedTopoFile: topoFile
        })
      });

      // Read the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullResponse += chunk;
        setOperationLogs(prev => prev + chunk);
      }

      // Check if the response indicates success
      if (fullResponse.includes('Operation completed successfully')) {
        setDeploymentSuccess(true);
      } else {
        const jsonMatch = fullResponse.match(/\{[^{}]*"success"\s*:\s*(true|false)[^{}]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.success) {
            setDeploymentSuccess(true);
          }
        }
      }
    } catch (error) {
      console.error('Error deploying from Git:', error);
      setOperationLogs(prev => prev + `\nError: ${error.message}`);
    } finally {
      setGitRepoUrl('');
      setGitClonedDir('');
      setGitTopoFiles([]);
      setSelectedTopoFile('');
      setGitRepoName('');
    }
  };

  /* Cancel the file selection and clean up the cloned directory */
  const handleCancelTopoFileSelect = async () => {
    setShowTopoFileSelectModal(false);

    // Clean up the cloned directory on the remote server
    if (gitClonedDir) {
      const serverIp = serverOptions[0].value;
      try {
        await fetch(`http://${serverIp}:3001/api/containerlab/cleanup-git-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clonedDir: gitClonedDir,
            username: user.username
          })
        });
      } catch (error) {
        console.error('Failed to cleanup cloned directory:', error);
      }
    }

    // Reset state
    setGitClonedDir('');
    setGitTopoFiles([]);
    setSelectedTopoFile('');
    setGitRepoName('');
    setGitRepoUrl('');
  };

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    // Cancel connect mode if active and user right-clicks
    setConnectSourceNode(null);
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      element: node,
      type: 'node',
    });
  }, []);

  const onEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setConnectSourceNode(null);
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      element: edge,
      type: 'edge',
    });
  }, []);

  const handleContextMenuClose = () => {
    setContextMenu(null);
  };

  // Close context menu when clicking anywhere outside it
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickAway = (e) => {
      if (!e.target.closest('.context-menu')) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    return () => document.removeEventListener('mousedown', handleClickAway);
  }, [contextMenu]);

  // Cancel connect mode on Escape key
  useEffect(() => {
    if (!connectSourceNode) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') setConnectSourceNode(null);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [connectSourceNode]);

  /* This is the function to handle the removal of a node from the topology. When you right click on a node and select remove, this function is called. */
  const handleRemoveNode = () => {
    const nodeToRemove = contextMenu.element;
    const updatedNodes = nodes.filter((n) => n.id !== nodeToRemove.id);
    const updatedEdges = edges.filter((e) => e.source !== nodeToRemove.id && e.target !== nodeToRemove.id);
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    updateYaml(updatedNodes, updatedEdges);
    handleContextMenuClose();
  };

  /* This is the function to handle the removal of an edge from the topology. When you right click on an edge and select remove, this function is called. */
  const handleRemoveEdge = () => {
    const edgeToRemove = contextMenu.element;
    setNodeInterfaces(prev => ({
      ...prev,
      [edgeToRemove.source]: prev[edgeToRemove.source].filter(i => i !== edgeToRemove.data.sourceInterface),
      [edgeToRemove.target]: prev[edgeToRemove.target].filter(i => i !== edgeToRemove.data.targetInterface)
    }));
    const updatedEdges = edges.filter((e) => e.id !== edgeToRemove.id);
    setEdges(updatedEdges);
    updateYaml(nodes, updatedEdges);
    handleContextMenuClose();
  };

  /* This is the function to handle the reset of the topology. When you click on the reset button, this function is called. */
  const handleReset = () => {
    setTopologyName("");

    setNodes([]);
    setEdges([]);
    
    setYamlOutput("");
    setEditableYaml("");
    setIsYamlValid(true);
    setYamlParseError("");
    
    // Reset the context state as well
    updateTopologyState({
      nodes: [],
      edges: [],
      yamlOutput: '',
      editableYaml: '',
      topologyName: '',
      nodeInterfaces: {},
      isYamlValid: true,
      yamlParseError: '',
      // Reset annotation states
      annotations: [],
      activeTool: 'select',
      selectedAnnotation: null,
      annotationColor: '#FF6B6B',
      textStyle: {
        fontSize: 16,
        bold: false,
        italic: false,
        underline: false
      },
      shapeStyle: {
        strokeWidth: 2,
        fillOpacity: 0.3
      }
    });
  };

  /* This is the function to validate the interface name. It is used to validate the interface name when a new edge is created. It has to be of the format eth1, eth2, eth3, etc. */
  const validateInterface = (interfaceName) => {
    const interfaceRegex = /^eth[1-9][0-9]?$|^eth[1-4][0-9]$|^eth5[0-4]$/;
    return interfaceRegex.test(interfaceName);
  };

  /* This is the function to handle the submission of the edge modal. When you click on the submit button in the edge modal, this function is called. */
  const handleEdgeModalSubmit = () => {
    if (!sourceInterface.trim() || !targetInterface.trim()) {
      setEdgeModalWarning(true);
      return;
    }

    if (!validateInterface(sourceInterface) || !validateInterface(targetInterface)) {
      setErrorMessage('Interface names must be in the format "eth" followed by a number (1-54)');
      setShowErrorModal(true);
      return;
    }
  
    const edgeId = isModifyingEdge 
      ? newEdgeData.id 
      : `edge_${newEdgeData.source}_${newEdgeData.target}_${sourceInterface}_${targetInterface}`;
  
    const newEdge = {
      ...newEdgeData,
      id: edgeId,
      data: {
        sourceInterface,
        targetInterface
      }
    };
  
    if (isModifyingEdge) {
      // Remove old interfaces before adding new ones
      const oldEdge = edges.find(e => e.id === newEdge.id);
      if (oldEdge) {
        setNodeInterfaces(prev => ({
          ...prev,
          [oldEdge.source]: prev[oldEdge.source].filter(i => i !== oldEdge.data.sourceInterface),
          [oldEdge.target]: prev[oldEdge.target].filter(i => i !== oldEdge.data.targetInterface)
        }));
      }
    }

    // Add new interfaces
    setNodeInterfaces(prev => ({
      ...prev,
      [newEdge.source]: [...(prev[newEdge.source] || []), sourceInterface],
      [newEdge.target]: [...(prev[newEdge.target] || []), targetInterface]
    }));
  
    if (isModifyingEdge) {
      setEdges((eds) => {
        const updatedEdges = eds.map((edge) => 
          edge.id === newEdge.id ? newEdge : edge
        );
        updateYaml(nodes, updatedEdges);
        return updatedEdges;
      });
      setIsModifyingEdge(false);
    } else {
      setEdges((eds) => {
        const duplicateEdge = eds.find(edge => 
          edge.source === newEdge.source && 
          edge.target === newEdge.target &&
          edge.data.sourceInterface === sourceInterface &&
          edge.data.targetInterface === targetInterface
        );
        
        if (duplicateEdge) {
          console.log("Duplicate edge not added:", newEdge);
          return eds;
        }
        const updatedEdges = [...eds, newEdge];
        updateYaml(nodes, updatedEdges);
        return updatedEdges;
      });
    }
  
    setIsEdgeModalOpen(false);
    setSourceInterface("");
    setTargetInterface("");
    setNewEdgeData(null);
    setEdgeModalWarning(false);
  };

  const handleModifyNode = () => {
    const nodeToModify = contextMenu.element;
    const nodeLabel = nodeToModify.data.label;
    const isRouter = nodeLabel.toLowerCase().includes('router');
    
    // Preserve the existing node's name and properties
    setNodeNamePrefix(nodeLabel.split('_')[0]); // Get the base name without any numbering
    setNodeKind(nodeToModify.data.kind || (isRouter ? 'ceos' : 'linux'));
    setNodeImage(nodeToModify.data.image || (isRouter ? 'arista_ceos:4.35.1F' : 'alpine'));
    setNodeCount(1);
    setNodeBinds(nodeToModify.data.binds || [""]);
    setNewNode(nodeToModify);
    setIsModifying(true);
    setIsModalOpen(true);
    setModalType("modify"); // Set to modify mode
    setContextMenu(null);
  };

  /* This is the function to handle the modification of an edge. When you right click on an edge and select modify, this function is called. */
  const handleModifyEdge = () => {
    const edgeToModify = contextMenu.element;
    setSourceInterface(edgeToModify.data.sourceInterface || "");
    setTargetInterface(edgeToModify.data.targetInterface || "");
    setNewEdgeData({
      ...edgeToModify,
      sourceNodeName: nodes.find(n => n.id === edgeToModify.source).data.label,
      targetNodeName: nodes.find(n => n.id === edgeToModify.target).data.label
    });
    setIsEdgeModalOpen(true);
    setIsModifyingEdge(true);
    setContextMenu(null);
  };

  /* This is the function to initialize the node interfaces from the YAML. It is used to initialize the node interfaces when a new node is created. */
  const initializeNodeInterfacesFromYaml = (yamlContent, currentNodes) => {
    try {
      const parsedYaml = yaml.load(yamlContent);
      if (!parsedYaml?.topology?.links) return;

      const newInterfaces = {};
      parsedYaml.topology.links.forEach(link => {
        const [sourceNode, sourceInterface] = link.endpoints[0].split(':');
        const [targetNode, targetInterface] = link.endpoints[1].split(':');

        // Find the node IDs from the node names using the provided currentNodes
        const sourceNodeId = currentNodes.find(n => n.data.label === sourceNode)?.id;
        const targetNodeId = currentNodes.find(n => n.data.label === targetNode)?.id;

        if (sourceNodeId) {
          newInterfaces[sourceNodeId] = [...(newInterfaces[sourceNodeId] || []), sourceInterface];
        }
        if (targetNodeId) {
          newInterfaces[targetNodeId] = [...(newInterfaces[targetNodeId] || []), targetInterface];
        }
      });

      setNodeInterfaces(newInterfaces);
    } catch (error) {
      console.error('Error initializing interfaces from YAML:', error);
    }
  };

  /* This is the function to handle the change in the YAML. When you edit the YAML, this function is called. */
  const handleYamlChange = (newYaml) => {
    setEditableYaml(newYaml);
    // Also update yamlOutput to ensure saves use the edited content
    setYamlOutput(newYaml);
  
    try {
      const parsedYaml = yaml.load(newYaml);
      
      // Extract the topology name from the edited YAML
      if (parsedYaml?.name) {
        // Update the topology name state with the name from the YAML
        setTopologyName(parsedYaml.name);
      }
  
      if (parsedYaml?.topology?.nodes) {
        const newNodes = Object.entries(parsedYaml.topology.nodes).map(([nodeName, nodeData], index) => {
          // Extract custom fields from the env object
          let customFields = [];
          
          if (nodeData.env && typeof nodeData.env === 'object') {
            // Extract from env object
            customFields = Object.entries(nodeData.env).map(([key, value]) => ({ 
              key, 
              value: String(value) 
            }));
          } else {
            // For backward compatibility, extract from root level
            customFields = Object.entries(nodeData)
              .filter(([k]) => !['kind', 'image', 'binds', 'mgmt-ipv4', 'mgmt-ipv6', 'startup-config', 'env'].includes(k))
              .map(([key, value]) => ({ key, value: String(value) }));
          }
          
          // Ensure we have at least one empty field for the UI
          if (customFields.length === 0) {
            customFields = [{ key: '', value: '' }];
          }
          
          return {
            id: nodeName,
                position: { x: 100 + (index % 3) * 200, y: 100 + Math.floor(index / 3) * 150 }, // Grid layout
            data: {
              label: nodeName,
              kind: nodeData.kind || '',
              image: nodeData.image || '',
              binds: nodeData.binds || [],
              startupConfig: nodeData['startup-config'] || '',
              customFields,
            }
          };
        });
  
        const newEdges = (parsedYaml.topology.links || []).map((link, index) => {
          const [source, sourceInterface] = link.endpoints[0].split(':');
          const [target, targetInterface] = link.endpoints[1].split(':');
  
          return {
            id: `edge_${index}`,
            source,
            target,
            data: {
              sourceInterface,
              targetInterface
            }
          };
        });
  
        setNodes(newNodes);
        setEdges(newEdges);
        
        // Initialize interfaces from the YAML, passing the newNodes directly
        initializeNodeInterfacesFromYaml(newYaml, newNodes);
        setIsYamlValid(true);
        setYamlParseError('');
        
        // If only one node is being edited, set nodeCustomFields for the modal
        if (newNodes.length === 1) {
          setNodeCustomFields(newNodes[0].data.customFields.length > 0 ? newNodes[0].data.customFields : [{ key: '', value: '' }]);
        }
        
        // Update context with new data
        updateTopologyState({
          nodes: newNodes,
          edges: newEdges,
          yamlOutput: newYaml,
          editableYaml: newYaml,
          topologyName: parsedYaml.name || '',
          isYamlValid: true,
          yamlParseError: '',
          nodeInterfaces: { ...nodeInterfaces }
        });
      } else {
        throw new Error('Invalid YAML structure');
      }
    } catch (error) {
      console.error('Failed to parse YAML:', error);
      setIsYamlValid(false);
      setYamlParseError(`Error parsing YAML: ${error.message}`);
      
      // Update context with error state
      updateTopologyState({
        yamlOutput: newYaml,
        editableYaml: newYaml,
        isYamlValid: false,
        yamlParseError: `Error parsing YAML: ${error.message}`
      });
    }
  };

  /* This is the function to handle the imported content. When you import a YAML file, this function is called. */
  const handleImportedContent = (content) => {
    console.log(content);
    setEditableYaml(content);
    setYamlOutput(content);
    
    try {
      // Parse the imported YAML content
      const parsedYaml = yaml.load(content);
      
      // Extract the topology name from the imported file
      let importedName = parsedYaml?.name || '';
      
      // If the topology name doesn't already include the username, prepend it
      if (importedName && !importedName.includes(user?.username)) {
        const updatedName = `${user?.username || ''}-${importedName}`;
        
        // Update the name in the parsed YAML
        parsedYaml.name = updatedName;
        
        // Update the topology name in the state
        setTopologyName(updatedName);
        
        // Generate new YAML with the updated name
        const updatedContent = yaml.dump(parsedYaml, {
          lineWidth: -1,
          quotingType: '"',
          forceQuotes: true
        });
        setEditableYaml(updatedContent);
        setYamlOutput(updatedContent);
        
        // Update context with the imported content
        updateTopologyState({
          yamlOutput: updatedContent,
          editableYaml: updatedContent,
          topologyName: updatedName
        });
        
        // Continue with the updated content
        // This will call handleYamlChange which now takes care of initializing interfaces
        handleYamlChange(updatedContent);
      } else {
        // If name already has username or there's no name, just use the original content
        setTopologyName(importedName);
        
        // Update context with the imported content
        updateTopologyState({
          yamlOutput: content,
          editableYaml: content,
          topologyName: importedName
        });
        
        handleYamlChange(content);
      }
    } catch (error) {
      console.error('Error processing imported YAML:', error);
      // Fall back to original behavior if there's an error
      handleYamlChange(content);
    }
    
    // initializeNodeInterfacesFromYaml is now called inside handleYamlChange
  };

  /* This is the function to handle the save of the topology. When you click on the save button, this function is called. This will open the save modal. */
  const handleSave = () => {
    setModalMode('save');
    setShowImportModal(true);
  };

  /* This is the function to handle the import of the topology. When you click on the import button, this function is called. This will open the import modal. */
  const handleImport = () => {
    setModalMode('import');
    setShowImportModal(true);
  };

  /* This is the function to handle the file manager action. When you click on the file manager button, this function is called. It opens the file manager modal. */
  const handleFileManagerAction = async (content, selectedPath) => {
    if (modalMode === 'import') {
      handleImportedContent(content);
    } else if (modalMode === 'save') {
      try {
        //alert("Saving topology...");
        const fileName = topologyName.includes(user?.username) 
          ? `${topologyName}.yaml` 
          : `${user?.username || ''}-${topologyName}.yaml`;
          
        console.log("Saving YAML content:", yamlOutput);
        
        const yamlBlob = new Blob([yamlOutput], { type: 'text/yaml;charset=utf-8' });
        const yamlFile = new File([yamlBlob], fileName, { type: 'text/yaml' });

        const formData = new FormData();
        formData.append('file', yamlFile);
        formData.append('serverIp', selectedPath.serverIp);
        formData.append('username', user.username);
        formData.append('path', selectedPath.path);

        const response = await fetch(`http://${selectedPath.serverIp}:3001/api/files/save`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save file');
        }

        setOperationTitle('Save Topology');
        setOperationLogs('Topology file saved successfully');
        setShowLogModal(true);
      } catch (error) {
        setErrorMessage(`Failed to save file: ${error.message}`);
        setShowErrorModal(true);
      }
    }
    setShowImportModal(false);
    setModalMode('import');
  };

  const handleNavigateToServers = () => {
    parentSetMode('servers');
    setShowLogModal(false);
  };

  const onNodeDragStop = useCallback(({ id, position }) => {
    // Only update node position, don't show modal
    setNodes((nds) =>
      nds.map((n) => n.id === id ? { ...n, position } : n)
    );
  }, []);

  const handleNodeModeSelect = (mode) => {
    setNodeCreationMode(mode);
  };

  /* This is the function to handle the change in the node name prefix. When you change the node name prefix, this function is called. */
  const handleNodeNamePrefixChange = (event) => {
    const prefix = event.target.value;
    setNodeNamePrefix(prefix);
    
    // Find the highest node number for this prefix
    let highestNodeNum = 0;
    const nodeRegex = new RegExp(`^${prefix}(\\d+)$`);
    
    nodes.forEach(node => {
      const match = node.data.label.match(nodeRegex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > highestNodeNum) {
          highestNodeNum = num;
        }
      }
    });
    
    // Update node name based on prefix and existing nodes
    setNodeName(`${prefix}${nodeCount > 1 ? (highestNodeNum + 1) : (highestNodeNum ? highestNodeNum + 1 : '')}`);
  };

  const handleNodeCountChange = (event) => {
    const count = parseInt(event.target.value, 10) || 1;
    const newCount = Math.max(1, Math.min(count, 100)); // Limit to 1-100 nodes
    setNodeCount(newCount);
    
    // Update node name if prefix exists
    if (nodeNamePrefix) {
      setNodeName(`${nodeNamePrefix}${newCount > 1 ? 1 : ''}`);
    }
  };

  /* This is the function to get the next node number. It is used to get the next node number when a new node is created automatically. */
  const getNextNodeNumber = () => {
    let highestNodeNum = 0;
    const nodeRegex = new RegExp(`^${nodeNamePrefix}(\\d+)$`);
    
    nodes.forEach(node => {
      const match = node.data.label.match(nodeRegex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > highestNodeNum) {
          highestNodeNum = num;
        }
      }
    });
    
    return highestNodeNum + 1;
  };

  /* This is the function to handle the submission of the modify node modal. When you click on the submit button in the modify node modal, this function is called. */
  const handleModifyNodeSubmit = () => {
    if (!nodeKind.trim()) {
      setNodeModalWarning(true);
      return;
    }

    const oldNodeId = newNode.id;
    const wasNameChanged = nodeName !== newNode.data.label;
    
    // If name changed, create a new node ID
    const updatedNodeId = wasNameChanged ? nodeName : oldNodeId;
    
    const updatedNode = {
      ...newNode,
      id: updatedNodeId, // Use the new name as ID
      type: 'svgNode',
      data: {
        ...newNode.data,
        label: nodeName,
        kind: nodeKind,
        image: nodeImage,
        binds: nodeBinds,
        startupConfig: nodeStartupConfig,
        customFields: nodeCustomFields,// Add custom fields
        ...(Object.fromEntries(nodeCustomFields.filter(f => f.key && f.value).map(f => [f.key, f.value])))
      },
    };

    // Create updated nodes array immediately
    const updatedNodes = nodes.map((node) => 
      node.id === oldNodeId ? updatedNode : node
    );

    // If name changed, update edges immediately
    let updatedEdges = edges;
    if (wasNameChanged) {
      updatedEdges = edges.map((edge) => {
        if (edge.source === oldNodeId) {
          return { ...edge, source: updatedNodeId };
        }
        if (edge.target === oldNodeId) {
          return { ...edge, target: updatedNodeId };
        }
        return edge;
      });
    }

    // Update YAML immediately with the new values
    updateYaml(updatedNodes, updatedEdges);

    // Then update the state
    setNodes(updatedNodes);
    if (wasNameChanged) {
      setEdges(updatedEdges);
      
      // Update node interfaces if name changed
      if (nodeInterfaces[oldNodeId]) {
        setNodeInterfaces(prev => {
          const updatedInterfaces = { ...prev };
          updatedInterfaces[updatedNodeId] = updatedInterfaces[oldNodeId];
          delete updatedInterfaces[oldNodeId];
          return updatedInterfaces;
        });
      }
    }

    // Reset state and close modal
    setShowModifyNodeModal(false);
    setIsModifying(false);
    setNodeModalWarning(false);
  };

  /* This is the function to handle the cancellation of the modify node modal. When you click on the cancel button in the modify node modal, this function is called. */
  const handleModifyNodeCancel = () => {
    setShowModifyNodeModal(false);
    setIsModifying(false);
    setNodeModalWarning(false);
  };

  /* This is the function to generate a random name. It is used to generate a random name for the topology if we did not provide a name. */
  const generateRandomName = () => {
    const character = randomNames.cartoonCharacters[Math.floor(Math.random() * randomNames.cartoonCharacters.length)];
    const place = randomNames.irishPlaces[Math.floor(Math.random() * randomNames.irishPlaces.length)];
    return `${user?.username || ''}-${character}-${place}`.toLowerCase();
  };

  const handleFileManagerBindSelect = (content, selectedFile) => {
    if (selectedFile && activeBindIndex !== null) {
      const newBinds = [...nodeBinds];
      newBinds[activeBindIndex] = {
        ...newBinds[activeBindIndex],
        source: selectedFile.path
      };
      setNodeBinds(newBinds);
    }
    setShowFileManagerForBind(false);
  };

  const handleRemoveBindNode = (index) => {
    const newBinds = [...nodeBinds];
    newBinds.splice(index, 1);
    setNodeBinds(newBinds);
  };

  // Add this function to handle checkbox changes
  const handleAutoAssignChange = (serverIp, isChecked) => {
    setAutoAssignMacSn(prev => ({
      ...prev,
      [serverIp]: isChecked
    }));
  };

  // 2. Add handlers for custom fields
  const handleCustomFieldChange = (index, field, value) => {
    const newFields = [...nodeCustomFields];
    newFields[index][field] = value;
    setNodeCustomFields(newFields);
  };
  const handleAddCustomField = () => {
    setNodeCustomFields([...nodeCustomFields, { key: '', value: '' }]);
  };
  const handleRemoveCustomField = (index) => {
    const newFields = [...nodeCustomFields];
    newFields.splice(index, 1);
    setNodeCustomFields(newFields);
  };

  // isValidConnection removed - edge validation handled in Connect flow

  /* Annotation Functions */
  const generateAnnotationId = () => `annotation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleAnnotationSelect = useCallback((annotation, event) => {
    if (event) {
      event.stopPropagation();
    }
    setSelectedAnnotation(annotation);
    setActiveTool('select');
  }, []);

  const handleAnnotationMouseMove = useCallback((event) => {
    if (!isDraggingAnnotation || !selectedAnnotation) return;
    
    event.preventDefault();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    const newX = mouseX - dragOffset.x;
    const newY = mouseY - dragOffset.y;
    
    setAnnotations(prev => prev.map(ann => {
      if (ann.id === selectedAnnotation.id) {
        if (ann.type === 'text' || ann.type === 'circle') {
          return { ...ann, x: newX, y: newY };
        } else if (ann.type === 'rectangle') {
          const width = Math.abs(ann.endX - ann.startX);
          const height = Math.abs(ann.endY - ann.startY);
          return { 
            ...ann, 
            startX: newX, 
            startY: newY,
            endX: newX + width,
            endY: newY + height
          };
        } else if (ann.type === 'line' || ann.type === 'arrow') {
          const deltaX = ann.endX - ann.startX;
          const deltaY = ann.endY - ann.startY;
          return { 
            ...ann, 
            startX: newX, 
            startY: newY,
            endX: newX + deltaX,
            endY: newY + deltaY
          };
        }
      }
      return ann;
    }));
  }, [isDraggingAnnotation, selectedAnnotation, dragOffset]);

  const handleAnnotationMouseUp = useCallback(() => {
    setIsDraggingAnnotation(false);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  const handleAnnotationMouseDown = useCallback((annotation, event) => {
    event.stopPropagation();
    event.preventDefault();
    
    if (activeTool !== 'select') return;
    
    const rect = event.currentTarget.closest('.cytoscape-wrapper').getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Calculate drag offset
    let offsetX = 0, offsetY = 0;
    if (annotation.type === 'text' || annotation.type === 'circle') {
      offsetX = mouseX - annotation.x;
      offsetY = mouseY - annotation.y;
    } else if (annotation.type === 'rectangle') {
      const x = Math.min(annotation.startX, annotation.endX);
      const y = Math.min(annotation.startY, annotation.endY);
      offsetX = mouseX - x;
      offsetY = mouseY - y;
    } else if (annotation.type === 'line' || annotation.type === 'arrow') {
      offsetX = mouseX - annotation.startX;
      offsetY = mouseY - annotation.startY;
    }
    
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDraggingAnnotation(true);
    setSelectedAnnotation(annotation);
  }, [activeTool]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotation) {
      setAnnotations(prev => prev.filter(a => a.id !== selectedAnnotation.id));
      setSelectedAnnotation(null);
    }
  }, [selectedAnnotation]);

  const handleCanvasClick = useCallback((event) => {
    // Prevent if clicking on Cytoscape canvas elements
    if (event.target.closest('.cytoscape-container')) {
      return;
    }
    
    if (activeTool === 'select') return;

    event.stopPropagation();
    
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (activeTool === 'text') {
      const text = prompt('Enter text:');
      if (text) {
        const newAnnotation = {
          id: generateAnnotationId(),
          type: 'text',
          x,
          y,
          text,
          color: annotationColor,
          style: textStyle
        };
        setAnnotations(prev => [...prev, newAnnotation]);
      }
    } else if (activeTool === 'circle') {
      const newAnnotation = {
        id: generateAnnotationId(),
        type: 'circle',
        x,
        y,
        radius: 30,
        color: annotationColor,
        style: shapeStyle
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    } else if (activeTool === 'rectangle') {
      const newAnnotation = {
        id: generateAnnotationId(),
        type: 'rectangle',
        startX: x - 40,
        startY: y - 25,
        endX: x + 40,
        endY: y + 25,
        color: annotationColor,
        style: shapeStyle
      };
      setAnnotations(prev => [...prev, newAnnotation]);
    }
  }, [activeTool, annotationColor, textStyle, shapeStyle]);

  const handleCanvasMouseDown = useCallback((event) => {
    // Prevent if clicking on Cytoscape canvas elements
    if (event.target.closest('.cytoscape-container')) {
      return;
    }

    // Check if clicking on an annotation for selection/moving
    if (event.target.closest('.annotation-element')) {
      return; // Let annotation handle its own events
    }

    // No drawing tools need mouse down now since rectangle is click-to-create
    return;
  }, [activeTool]);

  const handleCanvasMouseMove = useCallback((event) => {
    // Handle annotation resizing
    if (isResizing && selectedAnnotation && resizeHandle === 'radius') {
      const rect = event.currentTarget.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      const newRadius = Math.sqrt(
        Math.pow(mouseX - selectedAnnotation.x, 2) + 
        Math.pow(mouseY - selectedAnnotation.y, 2)
      );
      
      setAnnotations(prev => prev.map(ann => 
        ann.id === selectedAnnotation.id 
          ? { ...ann, radius: Math.max(10, newRadius) } // Minimum radius of 10
          : ann
      ));
    } else if (isResizing && selectedAnnotation && resizeHandle === 'rectangle') {
      const rect = event.currentTarget.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      
      // Update rectangle size by changing the endX and endY coordinates
      setAnnotations(prev => prev.map(ann => {
        if (ann.id === selectedAnnotation.id) {
          // Ensure minimum size of 20x20
          const newEndX = Math.max(ann.startX + 20, mouseX);
          const newEndY = Math.max(ann.startY + 20, mouseY);
          return { 
            ...ann, 
            endX: newEndX,
            endY: newEndY
          };
        }
        return ann;
      }));
    }

    // Handle moving annotations
    handleAnnotationMouseMove(event);
  }, [isResizing, selectedAnnotation, resizeHandle, handleAnnotationMouseMove]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsResizing(false);
    setResizeHandle(null);
    handleAnnotationMouseUp();
  }, [handleAnnotationMouseUp]);

  // YAML Editor Toggle Functions
  const handleToggleYamlEditor = () => {
    setIsYamlEditorCollapsed(!isYamlEditorCollapsed);
  };

  // Save YAML editor collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem('yamlEditorCollapsed', JSON.stringify(isYamlEditorCollapsed));
  }, [isYamlEditorCollapsed]);

  // Sync state changes with context
  useEffect(() => {
    updateTopologyState({
      nodes,
      edges,
      yamlOutput,
      editableYaml,
      topologyName,
      nodeInterfaces,
      isYamlValid,
      yamlParseError
    });
  }, [
    nodes,
    edges,
    yamlOutput,
    editableYaml,
    topologyName,
    nodeInterfaces,
    isYamlValid,
    yamlParseError
  ]);

  // Keyboard event handlers for annotations
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedAnnotation && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
          event.preventDefault();
          handleDeleteSelected();
        }
      } else if (event.key === 'Escape') {
        setSelectedAnnotation(null);
        setActiveTool('select');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedAnnotation, handleDeleteSelected]);

  return (
    // This is the main container for the topology designer. It is the container that contains HTML elements for the topology designer.
      <div className="app">
        <div className="dndflow">
          {mode === 'containerlab' ? (
            <>
              <div className="node-panel">
                <div className="input-group">
                  <label>Name of the topology:</label>
                  <input
                    type="text"
                    value={topologyName}
                    onChange={handleTopologyNameChange}
                  />
                </div>
                <Sidebar onNodeClick={onNodeClick} onGenerateClick={onGenerateClick} />

                <button className="reset-button" onClick={handleReset}>
                  🧹 Clear
                </button>
                
                <button className="file-manager-button" onClick={() => setShowFileManager(true)} style={{ marginTop: '15px' }}>
                  📁 File Manager
                </button>

                {/* YAML Action Buttons Group */}
                <div className="yaml-actions-group">
                  <button onClick={handleDownloadYaml} disabled={!yamlOutput.trim()} className="sidebar-action-button">
                    📤 Download YAML
                  </button>
                  <div className="deploy-buttons-row">
                    <button className="sidebar-action-button deploy-button half-width" onClick={handleDeploy} disabled={!yamlOutput.trim()}>
                      🚀 Deploy
                    </button>
                    <button
                      className="sidebar-action-button git-deploy-button half-width"
                      onClick={() => setShowGitDeployModal(true)}
                      title="Deploy from Git Repository"
                    >
                      🌐 Git
                    </button>
                  </div>
                  <button onClick={handleImport} className="sidebar-action-button">
                    📥 Import
                  </button>
                  <button onClick={handleSave} disabled={!yamlOutput.trim()} className="sidebar-action-button">
                    💾 Save
                  </button>
                </div>
              </div>
              <div
                className="cytoscape-wrapper"
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={(e) => {
                  // Cancel connect mode when clicking canvas background
                  if (connectSourceNode && !e.target.closest('.cytoscape-container canvas')) {
                    // Let handleCanvasClick run too
                  }
                  handleCanvasClick(e);
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                data-annotation-tool={activeTool}
              >
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
                {/* Cytoscape has built-in zoom/pan via mouse wheel and trackpad */}
              </div>
              
              {/* YAML Editor with Toggle Button */}
              <div className={`yaml-output-container ${isYamlEditorCollapsed ? 'collapsed' : 'expanded'}`}>
                <button 
                  className="yaml-toggle-button"
                  onClick={handleToggleYamlEditor}
                  title={isYamlEditorCollapsed ? 'Show YAML Editor' : 'Hide YAML Editor'}
                >
                  {isYamlEditorCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
                
                                  <div className="yaml-output">
                    <h3>YAML Editor</h3>
                    {/* Replaced textarea with Editor for syntax highlighting and line numbers */}
                    {/* You may need to add specific CSS classes/styles to .editor-container */}
                    {/* for features like line numbers background, etc. */}
                    {/* For basic line numbers, react-simple-code-editor often needs a container with specific padding/styling. */}
                    <div className="editor-container-with-lines" style={{ overflow: 'auto', height: '500px', border: '1px solid #ccc', borderRadius: '4px', width: '100%' }}>
                      <div className="line-numbers" aria-hidden="true">
                        {editableYaml.split('\n').map((_, index) => (
                          <div key={index} className="line-number">
                            {index + 1}
                          </div>
                        ))}
                      </div>
                      <div className="editor-content">
                        <Editor
                          value={editableYaml}
                          onValueChange={newYaml => handleYamlChange(newYaml)}
                          highlight={code => highlight(code, languages.yaml, 'yaml')}
                          padding={10}
                          style={{
                            fontFamily: '"Fira code", "Fira Mono", Consolas, "DejaVu Sans Mono", Monaco, "Andale Mono", "Ubuntu Mono", monospace',
                            fontSize: 12,
                            minHeight: '100%',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="yaml-output">
                <h3>YAML Output</h3>
                <pre>{yamlOutput}</pre>
              </div>
            </>
          )}
        </div>
        {isModalOpen && (
          <div className="modal">
            <div className="modal-content">
              <h2>{['router', 'leaf', 'spine'].some(term => newNode?.data?.label?.toLowerCase().includes(term)) ? 'Router Details' : 'Server/Hosts Details'}</h2>
              <div 
                className="form-content" 
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleModalSubmit();
                  }
                }}
              >
                {nodeModalWarning && (
                  <div className="warning-message">
                    Name prefix and Kind are required fields
                  </div>
                )}
                {modalType === "create" && (
                  <div className="input-group">
                    <label>Number of nodes:</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={nodeCount}
                      onChange={handleNodeCountChange}
                      className="node-count-input"
                    />
                  </div>
                )}
                {modalType === "create" && (
                  <div className="input-group">
                    <label>Name {nodeCount > 1 ? 'prefix' : ''} for {nodeCount > 1 ? 'nodes' : 'node'}: *</label>
                    <input
                      type="text"
                      value={nodeNamePrefix}
                      placeholder={nodeCount > 1 ? "e.g., 'leaf' will create leaf1, leaf2, etc." : "e.g., spine1"}
                      onChange={handleNodeNamePrefixChange}
                      className={nodeModalWarning && !nodeNamePrefix.trim() ? 'input-error' : ''}
                    />
                    {nodeCount > 1 && nodeNamePrefix && (
                      <span className="helper-text">
                        Will create: {nodeNamePrefix}{getNextNodeNumber()} through {nodeNamePrefix}{getNextNodeNumber() + nodeCount - 1}
                      </span>
                    )}
                  </div>
                )}
                {modalType === "modify" && (
                  <div className="input-group">
                    <label>Name for node: *</label>
                    <input
                      type="text"
                      value={nodeName}
                      onChange={handleNodeNameChange}
                      className={nodeModalWarning && !nodeName.trim() ? 'input-error' : ''}
                    />
                  </div>
                )}
                <div className="input-group">
                  <label>Kind: *</label>
                  <select
                    value={nodeKind}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setNodeKind(newValue);
                      setNodeImage('');
                      handleNodeKindChange({ target: { value: newValue } });
                    }}
                    className={`image-select ${nodeModalWarning && !nodeKind.trim() ? 'input-error' : ''}`}
                  >
                    <option value="">Select a kind</option>
                    {kindOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="input-group">
                  <label>Image:</label>
                  <select
                    value={nodeImage}
                    onChange={handleNodeImageChange}
                    className="image-select"
                  >
                    <option value="">Select an image</option>
                    {getFilteredImageOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Optional settings collapsible section */}
                <div>
                  <h3
                    className="settings-heading"
                    onClick={() => setShowOptionalSettings(!showOptionalSettings)}
                    style={{ cursor: 'pointer' }}
                  >
                    Optional settings {showOptionalSettings ? '▲' : '▼'}
                  </h3>
                  {showOptionalSettings && (
                    <div>
                      <div className="input-group">
                        <label>Binds:</label>
                        {nodeBinds.map((bind, index) => (
                          <div key={index} className="bind-input-group">
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '5px' }}>
                              <input
                                type="text"
                                value={bind.source}
                                placeholder="Source path"
                                onChange={(event) => handleNodeBindsChange(index, 'source', event.target.value)}
                                style={{ flex: 1 }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveBindIndex(index);
                                  setShowFileManagerForBind(true);
                                }}
                                className="browse-button"
                              >
                                Browse
                              </button>
                            </div>
                            <input
                              type="text"
                              value={bind.target}
                              placeholder="Target path (e.g., /mnt/flash/token:ro)"
                              onChange={(event) => handleNodeBindsChange(index, 'target', event.target.value)}
                              style={{ width: '100%' }}
                            />
                            <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                              {index === nodeBinds.length - 1 && (
                                <button
                                  type="button"
                                  onClick={handleAddBindNode}
                                  className="add-bind-button"
                                >
                                  +
                                </button>
                              )}
                              {nodeBinds.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBindNode(index)}
                                  className="remove-bind-button"
                                >
                                  -
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="input-group">
                        <label>Startup config:</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="text"
                            value={nodeStartupConfig}
                            placeholder="Path to startup config"
                            onChange={handleNodeStartupConfigChange}
                            style={{ flex: 1 }}
                          />
                          <button 
                            type="button" 
                            onClick={handleBrowseStartupConfig}
                            className="browse-button"
                          >
                            Browse
                          </button>
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Environment Variables:</label>
                        {nodeCustomFields.map((field, index) => (
                          <div key={index} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '5px' }}>
                            <input
                              type="text"
                              value={field.key}
                              placeholder="key"
                              onChange={e => handleCustomFieldChange(index, 'key', e.target.value)}
                              style={{ flex: 1 }}
                            />
                            <input
                              type="text"
                              value={field.value}
                              placeholder="value"
                              onChange={e => handleCustomFieldChange(index, 'value', e.target.value)}
                              style={{ flex: 1 }}
                            />
                            {index === nodeCustomFields.length - 1 && (
                              <button type="button" onClick={handleAddCustomField} className="add-bind-button">+</button>
                            )}
                            {nodeCustomFields.length > 1 && (
                              <button type="button" onClick={() => handleRemoveCustomField(index)} className="remove-bind-button">-</button>
                            )}
                          </div>
                        ))}
                        <div className="helper-text" style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                          Environment variables will appear under the 'env:' section in the YAML
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="actions">
                <button onClick={handleModalSubmit}>Submit</button>
                <button onClick={handleModalCancel}>Cancel</button>
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
            {contextMenu.type === 'node' && (
              <>
                <button onClick={handleConnectNode}>Connect</button>
                <button onClick={handleModifyNode}>Modify</button>
                <button className="delete-button" onClick={handleRemoveNode}>Delete</button>
              </>
            )}
            {contextMenu.type === 'edge' && (
              <>
                <button onClick={handleModifyEdge}>Modify</button>
                <button className="delete-button" onClick={handleRemoveEdge}>Delete</button>
              </>
            )}
          </div>
        )}
        {isEdgeModalOpen && (
          <div className="modal">
            <div className="modal-content">
              <h2>Configure Link Interfaces</h2>
              {edgeModalWarning && (
                <div className="warning-message">
                  Please enter both source and target interface details
                </div>
              )}
              <div className="input-group">
                <label>{newEdgeData.sourceNodeName} Interface:</label>
                <input
                  type="text"
                  value={sourceInterface}
                  onChange={(e) => setSourceInterface(e.target.value)}
                  className={edgeModalWarning && !sourceInterface.trim() ? 'input-error' : ''}
                />
              </div>
              <div className="input-group">
                <label>{newEdgeData.targetNodeName} Interface:</label>
                <input
                  type="text"
                  value={targetInterface}
                  onChange={(e) => setTargetInterface(e.target.value)}
                  className={edgeModalWarning && !targetInterface.trim() ? 'input-error' : ''}
                />
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
        {showWarning && (
          <div className="modal warning-modal">
            <div className="modal-content">
              <h3>Warning</h3>
              <p>Please enter the topology name first</p>
              <button onClick={() => setShowWarning(false)}>OK</button>
            </div>
          </div>
        )}
        {isDeployModalOpen && (
          <div className="modal">
            <div className="modal-content server-deploy-modal-content">
              <h2>Select Server to Deploy</h2>
              <div className="server-list">
                <div className="server-deployment-table">
                  <table className="server-table">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-200 px-4 py-2 text-left">Server Name</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">IP Address</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">CPU Usage</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">Memory Usage</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">Available Memory</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">Status</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">Auto Assign<br/>MAC & S/N</th>
                        <th className="border border-gray-200 px-4 py-2 text-left">Action</th>
                      </tr>
                    </thead>
                    <tbody>
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
                            <div className="flex items-center">
                              <div className="w-full bg-gray-200 rounded-full h-2.5" style={{ width: '100%', height: '10px', backgroundColor: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
                                <div 
                                  className={`h-2.5 rounded-full ${
                                    serverResources[server.ip]?.cpu > 80 ? 'bg-red-600' :
                                    serverResources[server.ip]?.cpu > 60 ? 'bg-yellow-600' :
                                    'bg-blue-600'
                                  }`}
                                  style={{ 
                                    width: `${serverResources[server.ip]?.cpu || 0}%`,
                                    height: '100%',
                                    backgroundColor: serverResources[server.ip]?.cpu > 80 ? '#dc2626' : 
                                                   serverResources[server.ip]?.cpu > 60 ? '#d97706' : 
                                                   '#2563eb'
                                  }}
                                ></div>
                              </div>
                              <span className="ml-2 text-sm">{serverResources[server.ip]?.cpu || 0}%</span>
                            </div>
                          </td>
                          <td className="border border-gray-200 px-4 py-2">
                            <div className="flex items-center">
                              <div className="w-full bg-gray-200 rounded-full h-2.5" style={{ width: '100%', height: '10px', backgroundColor: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
                                <div 
                                  className={`h-2.5 rounded-full ${
                                    serverResources[server.ip]?.memory > 80 ? 'bg-red-600' :
                                    serverResources[server.ip]?.memory > 60 ? 'bg-yellow-600' :
                                    'bg-green-600'
                                  }`}
                                  style={{ 
                                    width: `${serverResources[server.ip]?.memory || 0}%`,
                                    height: '100%',
                                    backgroundColor: serverResources[server.ip]?.memory > 80 ? '#dc2626' : 
                                                   serverResources[server.ip]?.memory > 60 ? '#d97706' : 
                                                   '#16a34a'
                                  }}
                                ></div>
                              </div>
                              <span className="ml-2 text-sm">{serverResources[server.ip]?.memory || 0}%</span>
                            </div>
                          </td>
                          <td className="border border-gray-200 px-4 py-2">
                            <span className="text-sm font-medium">
                              {serverResources[server.ip]?.availableMemory?.formatted || "N/A"}
                            </span>
                          </td>
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
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              checked={autoAssignMacSn[server.ip] || false}
                              onChange={(e) => handleAutoAssignChange(server.ip, e.target.checked)}
                            />
                          </td>
                          <td className="border border-gray-200 px-4 py-2">
                            <div className="server-action-buttons">
                              <button 
                                onClick={() => handleServerDeploy(server.ip)}
                                className={`server-action-btn text-sm px-3 py-1 rounded ${
                                  deployLoading[server.ip] ? 'bg-gray-400 text-gray-700' : 
                                  labExistsOnServer[server.ip] ? 'bg-gray-300 text-gray-500 opacity-60 cursor-not-allowed border border-gray-400' :
                                  serverResources[server.ip]?.memory > 90 ? 
                                    'bg-gray-300 text-gray-500 opacity-60 cursor-not-allowed border border-gray-400 deploy-warning' : 
                                  serverResources[server.ip]?.memory > 80 ?
                                    'deploy-warning' :
                                    'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-400'
                                }`}
                                disabled={deployLoading[server.ip] || labExistsOnServer[server.ip] || serverResources[server.ip]?.memory > 90}
                                title={
                                  labExistsOnServer[server.ip] ?
                                    "Topology already exists on this server. Use Reconfigure instead." :
                                  serverResources[server.ip]?.memory > 90 ? 
                                    "Deployment disabled: Server memory usage exceeds 90%" : 
                                  serverResources[server.ip]?.memory > 80 ?
                                    "Warning: High memory usage (above 80%)" :
                                    "Deploy topology to this server"
                                }
                                style={{
                                  transition: "all 0.2s ease",
                                  ...(serverResources[server.ip]?.memory > 90 && {
                                    filter: "grayscale(100%)",
                                    boxShadow: "none"
                                  })
                                }}
                              >
                                {deployLoading[server.ip] ? (
                                  <div className="flex items-center">
                                    <Loader2 className="animate-spin mr-2" size={18} />
                                    Deploying...
                                  </div>
                                ) : (
                                  serverResources[server.ip]?.memory > 80 ? (
                                    <div className="flex items-center">
                                      <span className="mr-1">⚠️</span>
                                      <span>Deploy</span>
                                    </div>
                                  ) : "Deploy"
                                )}
                              </button>
                              
                              <button
                                onClick={() => handleServerReconfigure(server.ip)}
                                className={`server-action-btn text-sm px-3 py-1 rounded ${
                                  reconfigureLoading[server.ip] ? 'bg-gray-400 text-gray-700' : 
                                  !labExistsOnServer[server.ip] ? 'bg-gray-300 text-gray-500 opacity-60 cursor-not-allowed border border-gray-400' :
                                  'bg-green-100 text-green-700 hover:bg-green-200 border border-green-400'
                                }`}
                                disabled={reconfigureLoading[server.ip] || !labExistsOnServer[server.ip]}
                                title={
                                  !labExistsOnServer[server.ip] ? 
                                  "Cannot reconfigure: This topology has not been deployed to this server yet" : 
                                  "Reconfigure existing topology"
                                }
                              >
                                {reconfigureLoading[server.ip] ? (
                                  <div className="flex items-center">
                                    <Loader2 className="animate-spin mr-2" size={18} />
                                    Reconfiguring...
                                  </div>
                                ) : "Reconfigure"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="actions mt-4">
                <button onClick={() => setIsDeployModalOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {/* Git Deploy Modal */}
        {showGitDeployModal && (
          <div className="modal">
            <div className="modal-content" style={{ width: '500px' }}>
              <h2>Deploy from Git Repository</h2>
              <div className="form-content">
                <div style={{ marginBottom: '15px' }}>
                  <label htmlFor="git-repo-url" style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                    Git Repository URL:
                  </label>
                  <input
                    id="git-repo-url"
                    type="text"
                    value={gitRepoUrl}
                    onChange={(e) => setGitRepoUrl(e.target.value)}
                    placeholder="https://github.com/username/repo.git"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && gitRepoUrl.trim()) {
                        handleGitDeploy();
                      }
                    }}
                  />
                  <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                    Enter the full Git repository URL. The system will clone the repository, find the topology YAML, and deploy it.
                  </p>
                </div>
              </div>
              <div className="actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleGitDeploy}
                  disabled={!gitRepoUrl.trim() || isGitScanning}
                  style={{
                    backgroundColor: (!gitRepoUrl.trim() || isGitScanning) ? '#cccccc' : '#16a34a',
                    color: 'white',
                    padding: '8px 20px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (!gitRepoUrl.trim() || isGitScanning) ? 'not-allowed' : 'pointer',
                    opacity: (!gitRepoUrl.trim() || isGitScanning) ? 0.6 : 1
                  }}
                >
                  {isGitScanning ? 'Scanning Repository...' : 'Deploy'}
                </button>
                <button
                  onClick={() => {
                    setShowGitDeployModal(false);
                    setGitRepoUrl('');
                  }}
                  disabled={isGitScanning}
                  style={{
                    padding: '8px 20px',
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    cursor: isGitScanning ? 'not-allowed' : 'pointer',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    opacity: isGitScanning ? 0.6 : 1
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Topology File Selection Modal */}
        {showTopoFileSelectModal && (
          <div className="modal">
            <div className="modal-content" style={{ width: '550px' }}>
              <h2>Select Topology File</h2>
              <div className="form-content">
                <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>
                  Multiple topology files were found in the repository. Please select the file you want to deploy:
                </p>
                <div style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px'
                }}>
                  {gitTopoFiles.map((file, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedTopoFile(file)}
                      style={{
                        padding: '10px 15px',
                        cursor: 'pointer',
                        backgroundColor: selectedTopoFile === file
                          ? '#e8f5e9'
                          : index % 2 === 0 ? '#ffffff' : '#fafafa',
                        borderBottom: index < gitTopoFiles.length - 1 ? '1px solid #f0f0f0' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'background-color 0.15s'
                      }}
                    >
                      <input
                        type="radio"
                        name="topoFile"
                        checked={selectedTopoFile === file}
                        onChange={() => setSelectedTopoFile(file)}
                        style={{ margin: 0 }}
                      />
                      <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                        {file}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  onClick={handleTopoFileSelect}
                  disabled={!selectedTopoFile}
                  style={{
                    backgroundColor: selectedTopoFile ? '#16a34a' : '#cccccc',
                    color: 'white',
                    padding: '8px 20px',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: selectedTopoFile ? 'pointer' : 'not-allowed',
                    opacity: selectedTopoFile ? 1 : 0.6
                  }}
                >
                  Deploy Selected
                </button>
                <button
                  onClick={handleCancelTopoFileSelect}
                  style={{
                    padding: '8px 20px',
                    border: '1px solid #dc2626',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: '#dc2626',
                    color: 'white'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        <LogModal
          isOpen={showLogModal}
          onClose={() => {
            setShowLogModal(false);
            setDeploymentSuccess(false);
          }}
          logs={operationLogs}
          title={operationTitle}
          showSuccess={deploymentSuccess}
          onNavigateToServers={handleNavigateToServers}
        />
        {showErrorModal && (
          <div className="modal warning-modal">
            <div className="modal-content">
              <h3>Error</h3>
              <p>{errorMessage}</p>
              <button onClick={() => setShowErrorModal(false)}>OK</button>
            </div>
          </div>
        )}
        <FileManagerModal
          isOpen={showImportModal}
          onClose={() => {
            setShowImportModal(false);
            setModalMode('import');
          }}
          onImport={handleFileManagerAction}
          username={user.username}
          mode={modalMode}
        />
        
        {/* FileManager Modal for Startup Config */}
        <FileManagerModal
          isOpen={showFileManagerForStartupConfig}
          onClose={() => setShowFileManagerForStartupConfig(false)}
          onImport={handleFileManagerStartupConfigSelect}
          username={user.username}
          mode="select"
        />

        {/* Main File Manager Modal */}
        <FileManagerModal
          isOpen={showFileManager}
          onClose={() => setShowFileManager(false)}
          onImport={() => {}}
          username={user.username}
          mode="manage"
          title="File Manager"
        />
        {/* FileManager Modal for Bind Points */}
        <FileManagerModal
          isOpen={showFileManagerForBind}
          onClose={() => setShowFileManagerForBind(false)}
          onImport={handleFileManagerBindSelect}
          username={user.username}
          mode="select"
        />

        {/* Generate Topology Modal */}
        {isGenerateModalOpen && (
          <div className="modal">
            <div className="modal-content" style={{ maxWidth: '900px', width: '600px' }}>
              <h2>Generate Topology</h2>
              <div className="helper-text" style={{ fontSize: '13px', marginBottom: '15px', padding: '0 10px', lineHeight: '1.5' }}>
                This will automatically generate a full mesh Clos topology where each spine connects to every leaf.
                For 3-tier topologies, each super-spine will connect to every spine, and each spine to every leaf.
              </div>
              <div className="form-content">
                <div className="input-group">
                  <label>Number of Tiers: *</label>
                  <select value={numberOfTiers} onChange={(e) => { setNumberOfTiers(e.target.value); setUseDefaultPrefix(true); setTier1Prefix(''); setTier2Prefix(''); setTier3Prefix(''); setTierPrefixErrors({}); }} className="image-select">
                    <option value="2">2 Tiers</option>
                    <option value="3">3 Tiers</option>
                  </select>
                </div>

                <div className="input-group" style={{ marginTop: '10px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={useDefaultPrefix} onChange={(e) => { setUseDefaultPrefix(e.target.checked); if (e.target.checked) { setTier1Prefix(''); setTier2Prefix(''); setTier3Prefix(''); setTierPrefixErrors({}); } }} style={{ margin: 0, width: '16px', height: '16px', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px' }}>{numberOfTiers === '3' ? 'Use default prefix (superspine, spine and leafs)' : 'Use default prefix (spine and leafs)'}</span>
                  </label>
                </div>

                {!useDefaultPrefix && (
                  <div style={{ marginTop: '10px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', background: '#f9f9f9' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>Custom Tier Prefixes</h4>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th style={{ padding: '8px', textAlign: 'left', width: '30%', fontWeight: '600' }}>Tier</th><th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Prefix *</th></tr></thead>
                      <tbody>
                        <tr><td style={{ padding: '8px' }}>Tier 1</td><td style={{ padding: '8px' }}><input type="text" value={tier1Prefix} onChange={(e) => handleTierPrefixChange('tier1', e.target.value)} placeholder={numberOfTiers === '3' ? 'superspine' : 'spine'} className={tierPrefixErrors.tier1 ? 'input-error' : ''} style={{ width: '97%' }} />{tierPrefixErrors.tier1 && <div className="warning-message" style={{ fontSize: '11px', marginTop: '3px' }}>{tierPrefixErrors.tier1}</div>}</td></tr>
                        <tr><td style={{ padding: '8px' }}>Tier 2</td><td style={{ padding: '8px' }}><input type="text" value={tier2Prefix} onChange={(e) => handleTierPrefixChange('tier2', e.target.value)} placeholder={numberOfTiers === '3' ? 'spine' : 'leaf'} className={tierPrefixErrors.tier2 ? 'input-error' : ''} style={{ width: '97%' }} />{tierPrefixErrors.tier2 && <div className="warning-message" style={{ fontSize: '11px', marginTop: '3px' }}>{tierPrefixErrors.tier2}</div>}</td></tr>
                        {numberOfTiers === '3' && (<tr><td style={{ padding: '8px' }}>Tier 3</td><td style={{ padding: '8px' }}><input type="text" value={tier3Prefix} onChange={(e) => handleTierPrefixChange('tier3', e.target.value)} placeholder="leaf" className={tierPrefixErrors.tier3 ? 'input-error' : ''} style={{ width: '97%' }} />{tierPrefixErrors.tier3 && <div className="warning-message" style={{ fontSize: '11px', marginTop: '3px' }}>{tierPrefixErrors.tier3}</div>}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="input-group">
                  <label>EOS Version: *</label>
                  <select value={generateEosVersion} onChange={(e) => { setGenerateEosVersion(e.target.value); if (e.target.value) setGenerateEosVersionError(''); }} className={generateEosVersionError ? 'image-select input-error' : 'image-select'}>
                    <option value="">Select an EOS version</option>
                    {imageOptions.filter(o => o.kind === 'ceos').map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                  </select>
                  {generateEosVersionError && <div className="warning-message" style={{ marginTop: '5px' }}>{generateEosVersionError}</div>}
                </div>

                {numberOfTiers === '3' && (
                  <div className="input-group">
                    <label>Number of {getTierDisplayLabel('superspine')} (Max: 8):</label>
                    <input type="number" min="1" max="8" value={numberOfSuperSpines} onChange={handleSuperSpinesChange} placeholder={`Enter number of ${getTierDisplayLabel('superspine').toLowerCase()}`} className={generateSuperSpinesError ? 'input-error' : ''} />
                    {generateSuperSpinesError && <div className="warning-message" style={{ marginTop: '5px' }}>{generateSuperSpinesError}</div>}
                  </div>
                )}

                <div className="input-group">
                  <label>Number of {getTierDisplayLabel('spine')} (Max: 16):</label>
                  <input type="number" min="1" max="16" value={numberOfSpines} onChange={handleSpinesChange} placeholder={`Enter number of ${getTierDisplayLabel('spine').toLowerCase()}`} className={generateSpinesError ? 'input-error' : ''} />
                  {generateSpinesError && <div className="warning-message" style={{ marginTop: '5px' }}>{generateSpinesError}</div>}
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: isEvenNumber(numberOfSpines) ? 'pointer' : 'not-allowed', userSelect: 'none' }} title={`Requires even number of ${getTierDisplayLabel('spine').toLowerCase()}`}>
                      <input type="checkbox" checked={spinesInMlag} onChange={(e) => setSpinesInMlag(e.target.checked)} disabled={!isEvenNumber(numberOfSpines)} style={{ cursor: isEvenNumber(numberOfSpines) ? 'pointer' : 'not-allowed', margin: 0, flexShrink: 0, width: '16px', height: '16px' }} />
                      <span style={{ color: isEvenNumber(numberOfSpines) ? 'inherit' : '#999', fontSize: '14px' }}>Are {getTierDisplayLabel('spine').toLowerCase()} in MLAG</span>
                    </label>
                    {!isEvenNumber(numberOfSpines) && numberOfSpines && <div className="helper-text" style={{ fontSize: '11px', marginTop: '5px', marginLeft: '24px' }}>MLAG requires even number of {getTierDisplayLabel('spine').toLowerCase()}</div>}
                  </div>
                </div>

                <div className="input-group">
                  <label>Number of {getTierDisplayLabel('leaf')} (Max: 32):</label>
                  <input type="number" min="1" max="32" value={numberOfLeafs} onChange={handleLeafsChange} placeholder={`Enter number of ${getTierDisplayLabel('leaf').toLowerCase()}`} className={generateLeafsError ? 'input-error' : ''} />
                  {generateLeafsError && <div className="warning-message" style={{ marginTop: '5px' }}>{generateLeafsError}</div>}
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: isEvenNumber(numberOfLeafs) ? 'pointer' : 'not-allowed', userSelect: 'none' }} title={`Requires even number of ${getTierDisplayLabel('leaf').toLowerCase()}`}>
                      <input type="checkbox" checked={leafsInMlag} onChange={(e) => setLeafsInMlag(e.target.checked)} disabled={!isEvenNumber(numberOfLeafs)} style={{ cursor: isEvenNumber(numberOfLeafs) ? 'pointer' : 'not-allowed', margin: 0, flexShrink: 0, width: '16px', height: '16px' }} />
                      <span style={{ color: isEvenNumber(numberOfLeafs) ? 'inherit' : '#999', fontSize: '14px' }}>Are {getTierDisplayLabel('leaf').toLowerCase()} in MLAG</span>
                    </label>
                    {!isEvenNumber(numberOfLeafs) && numberOfLeafs && <div className="helper-text" style={{ fontSize: '11px', marginTop: '5px', marginLeft: '24px' }}>MLAG requires even number of {getTierDisplayLabel('leaf').toLowerCase()}</div>}
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: (parseInt(numberOfLeafs) > 0) ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                      <input type="checkbox" checked={addHosts} onChange={(e) => { setAddHosts(e.target.checked); if (!e.target.checked) { setNumberOfHosts(''); setHostParents({}); setHostsError(''); setHostParentErrors({}); } }} disabled={!(parseInt(numberOfLeafs) > 0)} style={{ margin: 0, width: '16px', height: '16px', flexShrink: 0, cursor: (parseInt(numberOfLeafs) > 0) ? 'pointer' : 'not-allowed' }} />
                      <span style={{ fontSize: '14px', color: (parseInt(numberOfLeafs) > 0) ? 'inherit' : '#999' }}>Add hosts</span>
                    </label>
                  </div>
                </div>

                {addHosts && (
                  <div className="input-group" style={{ marginTop: '15px' }}>
                    <label>Number of hosts (Max: 32):</label>
                    <input type="number" min="1" max="32" value={numberOfHosts} onChange={handleHostsChange} placeholder="Enter number of hosts" className={hostsError ? 'input-error' : ''} />
                    {hostsError && <div className="warning-message" style={{ marginTop: '5px' }}>{hostsError}</div>}
                  </div>
                )}

                {addHosts && parseInt(numberOfHosts) > 0 && parseInt(numberOfLeafs) > 0 && (
                  <div style={{ marginTop: '15px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', background: '#f9f9f9' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>Host Connections</h4>
                    <div className="helper-text" style={{ fontSize: '12px', marginBottom: '10px' }}>Select parent leaf(s) for each host. Hold Ctrl/Cmd for multi-select.</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th style={{ padding: '8px', textAlign: 'left', width: '30%', fontWeight: '600' }}>Host</th><th style={{ padding: '8px', textAlign: 'left', fontWeight: '600' }}>Parent Leafs *</th></tr></thead>
                      <tbody>
                        {Array.from({length: parseInt(numberOfHosts)}, (_, i) => {
                          const hostName = `host${i+1}`;
                          return (
                            <tr key={i}>
                              <td style={{ padding: '8px', fontWeight: '500' }}>{hostName}</td>
                              <td style={{ padding: '8px' }}>
                                <select multiple value={hostParents[hostName] || []} onChange={(e) => handleHostParentChange(hostName, e)} className={hostParentErrors[hostName] ? 'input-error' : ''} style={{ width: '100%', minHeight: '70px', padding: '4px', borderRadius: '4px' }}>
                                  {Array.from({length: parseInt(numberOfLeafs)}, (_, j) => (<option key={j} value={`leaf${j+1}`}>leaf{j+1}</option>))}
                                </select>
                                {hostParentErrors[hostName] && <div className="warning-message" style={{ marginTop: '3px', fontSize: '11px' }}>{hostParentErrors[hostName]}</div>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Startup config checkbox */}
                <div style={{ marginTop: '20px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: hasAnyDevices() ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                    <input type="checkbox" checked={addStartupConfig} onChange={(e) => { setAddStartupConfig(e.target.checked); if (!e.target.checked) { setApplyStartupConfigToAll(true); setGenerateStartupConfigPath(''); setGenerateStartupConfigError(''); setSelectedDevicesForStartupConfig({ superSpines: [], spines: [], leafs: [], hosts: [] }); } }} disabled={!hasAnyDevices()} style={{ margin: 0, width: '16px', height: '16px', flexShrink: 0, cursor: hasAnyDevices() ? 'pointer' : 'not-allowed' }} />
                    <span style={{ fontSize: '14px', color: hasAnyDevices() ? 'inherit' : '#999' }}>Add startup config</span>
                  </label>
                  {!hasAnyDevices() && <div className="helper-text" style={{ fontSize: '11px', marginTop: '5px', marginLeft: '24px' }}>Enter device counts first</div>}
                </div>

                {addStartupConfig && (
                  <div style={{ marginTop: '15px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', background: '#f9f9f9' }}>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={applyStartupConfigToAll} onChange={(e) => { setApplyStartupConfigToAll(e.target.checked); if (e.target.checked) setSelectedDevicesForStartupConfig({ superSpines: [], spines: [], leafs: [], hosts: [] }); }} style={{ margin: 0, width: '16px', height: '16px', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>Apply to all devices</span>
                      </label>
                    </div>
                    <div className="input-group">
                      <label>Startup config path: *</label>
                      <input type="text" value={generateStartupConfigPath} placeholder="Path to startup config" onChange={(e) => { setGenerateStartupConfigPath(e.target.value); if (e.target.value.trim()) setGenerateStartupConfigError(''); }} className={generateStartupConfigError ? 'input-error' : ''} style={{ width: '100%' }} />
                      {generateStartupConfigError && <div className="warning-message" style={{ marginTop: '5px' }}>{generateStartupConfigError}</div>}
                    </div>
                    {!applyStartupConfigToAll && (
                      <div style={{ marginTop: '15px' }}>
                        <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>Select devices:</h4>
                        {numberOfTiers === '3' && parseInt(numberOfSuperSpines) > 0 && (
                          <div style={{ marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><strong style={{ fontSize: '13px' }}>{getTierDisplayLabel('superspine')}:</strong><button type="button" onClick={() => { const p = useDefaultPrefix ? 'superspine' : tier1Prefix; handleSelectAllTier('superSpines', parseInt(numberOfSuperSpines), p); }} style={{ fontSize: '12px', padding: '4px 8px' }}>{(() => { const p = useDefaultPrefix ? 'superspine' : tier1Prefix; return areAllDevicesSelected('superSpines', parseInt(numberOfSuperSpines), p) ? 'Deselect All' : 'Select All'; })()}</button></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                              {Array.from({ length: parseInt(numberOfSuperSpines) }, (_, i) => { const p = useDefaultPrefix ? 'superspine' : tier1Prefix; const d = `${p}${i+1}`; const s = selectedDevicesForStartupConfig.superSpines?.includes(d); return (<label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '3px', background: s ? '#e3f2fd' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={s} onChange={() => handleDeviceToggleForStartupConfig('superSpines', d)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px' }}>{d}</span></label>); })}
                            </div>
                          </div>
                        )}
                        {parseInt(numberOfSpines) > 0 && (
                          <div style={{ marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><strong style={{ fontSize: '13px' }}>{getTierDisplayLabel('spine')}:</strong><button type="button" onClick={() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'spine' : tier2Prefix) : (useDefaultPrefix ? 'spine' : tier1Prefix); handleSelectAllTier('spines', parseInt(numberOfSpines), p); }} style={{ fontSize: '12px', padding: '4px 8px' }}>{(() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'spine' : tier2Prefix) : (useDefaultPrefix ? 'spine' : tier1Prefix); return areAllDevicesSelected('spines', parseInt(numberOfSpines), p) ? 'Deselect All' : 'Select All'; })()}</button></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                              {Array.from({ length: parseInt(numberOfSpines) }, (_, i) => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'spine' : tier2Prefix) : (useDefaultPrefix ? 'spine' : tier1Prefix); const d = `${p}${i+1}`; const s = selectedDevicesForStartupConfig.spines?.includes(d); return (<label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '3px', background: s ? '#e3f2fd' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={s} onChange={() => handleDeviceToggleForStartupConfig('spines', d)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px' }}>{d}</span></label>); })}
                            </div>
                          </div>
                        )}
                        {parseInt(numberOfLeafs) > 0 && (
                          <div style={{ marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><strong style={{ fontSize: '13px' }}>{getTierDisplayLabel('leaf')}:</strong><button type="button" onClick={() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'leaf' : tier3Prefix) : (useDefaultPrefix ? 'leaf' : tier2Prefix); handleSelectAllTier('leafs', parseInt(numberOfLeafs), p); }} style={{ fontSize: '12px', padding: '4px 8px' }}>{(() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'leaf' : tier3Prefix) : (useDefaultPrefix ? 'leaf' : tier2Prefix); return areAllDevicesSelected('leafs', parseInt(numberOfLeafs), p) ? 'Deselect All' : 'Select All'; })()}</button></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                              {Array.from({ length: parseInt(numberOfLeafs) }, (_, i) => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'leaf' : tier3Prefix) : (useDefaultPrefix ? 'leaf' : tier2Prefix); const d = `${p}${i+1}`; const s = selectedDevicesForStartupConfig.leafs?.includes(d); return (<label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '3px', background: s ? '#e3f2fd' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={s} onChange={() => handleDeviceToggleForStartupConfig('leafs', d)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px' }}>{d}</span></label>); })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Binds checkbox */}
                <div style={{ marginTop: '20px' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: hasAnyDevices() ? 'pointer' : 'not-allowed', userSelect: 'none' }}>
                    <input type="checkbox" checked={addBinds} onChange={(e) => { setAddBinds(e.target.checked); if (!e.target.checked) { setApplyBindsToAll(true); setGenerateBinds([{ source: '', target: '' }]); setGenerateBindsErrors([]); setSelectedDevicesForBinds({ superSpines: [], spines: [], leafs: [], hosts: [] }); } }} disabled={!hasAnyDevices()} style={{ margin: 0, width: '16px', height: '16px', flexShrink: 0, cursor: hasAnyDevices() ? 'pointer' : 'not-allowed' }} />
                    <span style={{ fontSize: '14px', color: hasAnyDevices() ? 'inherit' : '#999' }}>Add binds</span>
                  </label>
                  {!hasAnyDevices() && <div className="helper-text" style={{ fontSize: '11px', marginTop: '5px', marginLeft: '24px' }}>Enter device counts first</div>}
                </div>

                {addBinds && (
                  <div style={{ marginTop: '15px', padding: '15px', border: '1px solid #ddd', borderRadius: '4px', background: '#f9f9f9' }}>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={applyBindsToAll} onChange={(e) => { setApplyBindsToAll(e.target.checked); if (e.target.checked) setSelectedDevicesForBinds({ superSpines: [], spines: [], leafs: [], hosts: [] }); }} style={{ margin: 0, width: '16px', height: '16px', flexShrink: 0 }} />
                        <span style={{ fontSize: '14px', fontWeight: '500' }}>Apply to all devices</span>
                      </label>
                    </div>
                    <div className="input-group">
                      <label>Binds: *</label>
                      {generateBinds.map((bind, index) => (
                        <div key={index} style={{ marginBottom: '15px' }}>
                          <input type="text" value={bind.source} placeholder="Source path" onChange={(e) => handleGenerateBindChange(index, 'source', e.target.value)} className={generateBindsErrors[index]?.source ? 'input-error' : ''} style={{ width: '100%', marginBottom: '5px' }} />
                          {generateBindsErrors[index]?.source && <div className="warning-message" style={{ marginTop: '2px', marginBottom: '5px' }}>{generateBindsErrors[index].source}</div>}
                          <input type="text" value={bind.target} placeholder="Target path (e.g., /mnt/flash/token:ro)" onChange={(e) => handleGenerateBindChange(index, 'target', e.target.value)} className={generateBindsErrors[index]?.target ? 'input-error' : ''} style={{ width: '100%', marginBottom: '5px' }} />
                          {generateBindsErrors[index]?.target && <div className="warning-message" style={{ marginTop: '2px', marginBottom: '5px' }}>{generateBindsErrors[index].target}</div>}
                          <div style={{ display: 'flex', gap: '10px' }}>
                            {index === generateBinds.length - 1 && <button type="button" onClick={handleAddGenerateBind} className="add-bind-button">+</button>}
                            {generateBinds.length > 1 && <button type="button" onClick={() => handleRemoveGenerateBind(index)} className="remove-bind-button">-</button>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {!applyBindsToAll && (
                      <div style={{ marginTop: '15px' }}>
                        <h4 style={{ marginTop: 0, marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>Select devices:</h4>
                        {numberOfTiers === '3' && parseInt(numberOfSuperSpines) > 0 && (
                          <div style={{ marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><strong style={{ fontSize: '13px' }}>{getTierDisplayLabel('superspine')}:</strong><button type="button" onClick={() => { const p = useDefaultPrefix ? 'superspine' : tier1Prefix; handleSelectAllTierForBinds('superSpines', parseInt(numberOfSuperSpines), p); }} style={{ fontSize: '12px', padding: '4px 8px' }}>{(() => { const p = useDefaultPrefix ? 'superspine' : tier1Prefix; return areAllDevicesSelectedForBinds('superSpines', parseInt(numberOfSuperSpines), p) ? 'Deselect All' : 'Select All'; })()}</button></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                              {Array.from({ length: parseInt(numberOfSuperSpines) }, (_, i) => { const p = useDefaultPrefix ? 'superspine' : tier1Prefix; const d = `${p}${i+1}`; const s = selectedDevicesForBinds.superSpines?.includes(d); return (<label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '3px', background: s ? '#e3f2fd' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={s} onChange={() => handleDeviceToggleForBinds('superSpines', d)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px' }}>{d}</span></label>); })}
                            </div>
                          </div>
                        )}
                        {parseInt(numberOfSpines) > 0 && (
                          <div style={{ marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><strong style={{ fontSize: '13px' }}>{getTierDisplayLabel('spine')}:</strong><button type="button" onClick={() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'spine' : tier2Prefix) : (useDefaultPrefix ? 'spine' : tier1Prefix); handleSelectAllTierForBinds('spines', parseInt(numberOfSpines), p); }} style={{ fontSize: '12px', padding: '4px 8px' }}>{(() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'spine' : tier2Prefix) : (useDefaultPrefix ? 'spine' : tier1Prefix); return areAllDevicesSelectedForBinds('spines', parseInt(numberOfSpines), p) ? 'Deselect All' : 'Select All'; })()}</button></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                              {Array.from({ length: parseInt(numberOfSpines) }, (_, i) => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'spine' : tier2Prefix) : (useDefaultPrefix ? 'spine' : tier1Prefix); const d = `${p}${i+1}`; const s = selectedDevicesForBinds.spines?.includes(d); return (<label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '3px', background: s ? '#e3f2fd' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={s} onChange={() => handleDeviceToggleForBinds('spines', d)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px' }}>{d}</span></label>); })}
                            </div>
                          </div>
                        )}
                        {parseInt(numberOfLeafs) > 0 && (
                          <div style={{ marginBottom: '15px', padding: '12px', background: '#fff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><strong style={{ fontSize: '13px' }}>{getTierDisplayLabel('leaf')}:</strong><button type="button" onClick={() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'leaf' : tier3Prefix) : (useDefaultPrefix ? 'leaf' : tier2Prefix); handleSelectAllTierForBinds('leafs', parseInt(numberOfLeafs), p); }} style={{ fontSize: '12px', padding: '4px 8px' }}>{(() => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'leaf' : tier3Prefix) : (useDefaultPrefix ? 'leaf' : tier2Prefix); return areAllDevicesSelectedForBinds('leafs', parseInt(numberOfLeafs), p) ? 'Deselect All' : 'Select All'; })()}</button></div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                              {Array.from({ length: parseInt(numberOfLeafs) }, (_, i) => { const p = numberOfTiers === '3' ? (useDefaultPrefix ? 'leaf' : tier3Prefix) : (useDefaultPrefix ? 'leaf' : tier2Prefix); const d = `${p}${i+1}`; const s = selectedDevicesForBinds.leafs?.includes(d); return (<label key={d} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 8px', borderRadius: '3px', background: s ? '#e3f2fd' : 'transparent', cursor: 'pointer' }}><input type="checkbox" checked={s} onChange={() => handleDeviceToggleForBinds('leafs', d)} style={{ width: '16px', height: '16px' }} /><span style={{ fontSize: '13px' }}>{d}</span></label>); })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="actions">
                <button onClick={handleGenerateSubmit}>Generate</button>
                <button onClick={handleGenerateClose}>Close</button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
};

export default App;