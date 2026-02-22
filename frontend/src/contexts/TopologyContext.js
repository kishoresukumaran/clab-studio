import React, { createContext, useState, useContext } from 'react';

// Create the context
const TopologyContext = createContext();

// Create a custom hook to use the topology context
export const useTopology = () => useContext(TopologyContext);

// Create the provider component
export const TopologyProvider = ({ children }) => {
  const [topologyState, setTopologyState] = useState({
    nodes: [],
    edges: [],
    yamlOutput: '',
    editableYaml: '',
    topologyName: '',
    nodeInterfaces: {},
    isYamlValid: true,
    yamlParseError: '',
    // Annotation states
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

  // Function to update the topology state
  const updateTopologyState = (newState) => {
    setTopologyState(prevState => ({
      ...prevState,
      ...newState
    }));
  };

  // Value to be provided by the context
  const value = {
    topologyState,
    updateTopologyState
  };

  return (
    <TopologyContext.Provider value={value}>
      {children}
    </TopologyContext.Provider>
  );
}; 