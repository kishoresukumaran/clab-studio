/**
 * Cytoscape.js style and layout configuration for the topology viewer.
 * Ported from /opt/clab-topo-viewer/static/script.js
 */

/**
 * Returns the Cytoscape.js stylesheet array.
 */
export function getCytoscapeStyles() {
  return [
    // Default node style
    {
      selector: 'node',
      style: {
        'background-color': '#475569',
        'background-gradient-stop-colors': '#475569 #64748b',
        'background-gradient-direction': 'to-bottom-right',
        label: 'data(label)',
        color: '#FFFFFF',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'font-weight': '600',
        'font-family':
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        width: '90px',
        height: '45px',
        'border-width': '2px',
        'border-color': '#334155',
        'text-outline-width': '2px',
        'text-outline-color': '#1e293b',
        shape: 'round-rectangle',
        'border-radius': '12px',
        'box-shadow-blur': '8px',
        'box-shadow-color': 'rgba(0,0,0,0.3)',
        'box-shadow-offset-x': '0px',
        'box-shadow-offset-y': '4px',
      },
    },
    // cEOS nodes (network devices) - green
    {
      selector: '.node-ceos',
      style: {
        'background-color': '#059669',
        'background-gradient-stop-colors': '#059669 #10b981',
        'border-color': '#047857',
        'box-shadow-color': 'rgba(5,150,105,0.4)',
      },
    },
    // Linux nodes (hosts/servers) - red
    {
      selector: '.node-linux',
      style: {
        'background-color': '#dc2626',
        'background-gradient-stop-colors': '#dc2626 #ef4444',
        'border-color': '#b91c1c',
        'box-shadow-color': 'rgba(220,38,38,0.4)',
      },
    },
    // Unknown / other nodes - indigo
    {
      selector: '.node-unknown',
      style: {
        'background-color': '#6366f1',
        'background-gradient-stop-colors': '#6366f1 #8b5cf6',
        'border-color': '#4f46e5',
        'box-shadow-color': 'rgba(99,102,241,0.4)',
      },
    },
    // Edge styles
    {
      selector: 'edge',
      style: {
        width: '3px',
        'line-color': '#10b981',
        'curve-style': 'bezier',
        'source-label': 'data(source_interface)',
        'target-label': 'data(target_interface)',
        'font-size': '11px',
        'font-weight': '600',
        'font-family':
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#065f46',
        'text-background-color': 'rgba(255, 255, 255, 0.95)',
        'text-background-opacity': 1,
        'text-background-padding': '4px',
        'text-border-width': '1px',
        'text-border-color': 'rgba(16, 185, 129, 0.2)',
        'text-border-opacity': 1,
        'source-text-offset': '24px',
        'target-text-offset': '24px',
        'line-gradient-stop-colors': '#10b981 #34d399',
        'line-gradient-direction': 'to-target',
        'line-opacity': 0.8,
      },
    },
    // Selected node
    {
      selector: 'node:selected',
      style: {
        'border-width': '4px',
        'border-color': '#fbbf24',
        'box-shadow-blur': '12px',
        'box-shadow-color': 'rgba(251, 191, 36, 0.6)',
        'box-shadow-offset-y': '6px',
      },
    },
    // Selected edge
    {
      selector: 'edge:selected',
      style: {
        width: '4px',
        'line-color': '#fbbf24',
        color: '#92400e',
        'line-opacity': 1,
      },
    },
    // Hovered / active node
    {
      selector: 'node:active',
      style: {
        'overlay-color': '#667eea',
        'overlay-padding': '12px',
        'overlay-opacity': 0.3,
      },
    },
  ];
}

/**
 * Returns the layout configuration object.
 * Uses cose-bilkent when available, falls back to built-in cose.
 *
 * @param {boolean} [coseBilkentAvailable=true] - whether the cose-bilkent extension is registered
 * @param {boolean} [randomize=false] - randomize positions (used for "Reset Layout")
 */
export function getLayoutConfig(coseBilkentAvailable = true, randomize = false) {
  if (coseBilkentAvailable) {
    return {
      name: 'cose-bilkent',
      quality: 'default',
      nodeRepulsion: 4500,
      idealEdgeLength: 50,
      edgeElasticity: 0.45,
      nestingFactor: 0.1,
      gravity: 0.25,
      numIter: 2500,
      tile: true,
      animate: 'end',
      animationDuration: 1000,
      randomize,
    };
  }

  // Fallback to built-in cose layout
  return {
    name: 'cose',
    idealEdgeLength: 100,
    nodeOverlap: 20,
    refresh: 20,
    fit: true,
    padding: 30,
    randomize,
    componentSpacing: 100,
    nodeRepulsion: 400000,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
    animate: 'end',
    animationDuration: 1000,
  };
}
