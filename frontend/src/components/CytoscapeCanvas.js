import React, { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import cytoscape from 'cytoscape';

const GHOST_NODE_ID = '__connect_ghost__';
const GHOST_EDGE_ID = '__connect_ghost_edge__';

function getCytoscapeStyles() {
  return [
    {
      selector: 'node',
      style: {
        'background-image': '/router_arista.svg',
        'background-fit': 'contain',
        'background-color': 'transparent',
        'background-opacity': 0,
        'width': 70,
        'height': 70,
        'label': 'data(label)',
        'text-valign': 'bottom',
        'text-halign': 'center',
        'font-size': 10,
        'color': '#333',
        'text-margin-y': 5,
        'border-width': 0,
        'shape': 'rectangle',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 2,
        'border-color': '#0041d0',
      },
    },
    {
      selector: 'node.connect-source',
      style: {
        'border-width': 3,
        'border-color': '#0041d0',
        'border-style': 'dashed',
      },
    },
    {
      selector: `node#${GHOST_NODE_ID}`,
      style: {
        'width': 1,
        'height': 1,
        'background-opacity': 0,
        'border-width': 0,
        'label': '',
        'events': 'no',
      },
    },
    {
      selector: 'node.connect-hover',
      style: {
        'border-width': 3,
        'border-color': '#0041d0',
        'border-style': 'solid',
      },
    },
    {
      selector: `edge#${GHOST_EDGE_ID}`,
      style: {
        'curve-style': 'straight',
        'width': 2,
        'line-color': '#0041d0',
        'line-style': 'dashed',
        'line-dash-pattern': [6, 4],
        'target-arrow-shape': 'none',
        'source-label': '',
        'target-label': '',
        'events': 'no',
      },
    },
    {
      selector: 'edge',
      style: {
        'curve-style': 'straight',
        'width': 1.5,
        'line-color': '#b1b1b7',
        'target-arrow-shape': 'none',
        'source-label': 'data(sourceInterface)',
        'target-label': 'data(targetInterface)',
        'source-text-offset': 40,
        'target-text-offset': 40,
        'font-size': 7,
        'text-rotation': 'autorotate',
        'source-text-margin-y': -10,
        'target-text-margin-y': -10,
        'color': '#333',
        'text-background-color': '#f0f0f0',
        'text-background-opacity': 1,
        'text-background-padding': '2px',
        'text-background-shape': 'roundrectangle',
      },
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': '#0041d0',
        'width': 2.5,
      },
    },
  ];
}

function syncElements(cy, reactNodes, reactEdges) {
  const currentNodeIds = new Set();
  cy.nodes().forEach(n => currentNodeIds.add(n.id()));
  const currentEdgeIds = new Set();
  cy.edges().forEach(e => currentEdgeIds.add(e.id()));
  const reactNodeIds = new Set(reactNodes.map(n => n.id));
  const reactEdgeIds = new Set(reactEdges.map(e => e.id));

  // Remove elements no longer in React state (skip ghost elements used for connect mode)
  cy.nodes().forEach(n => {
    if (n.id() === GHOST_NODE_ID) return;
    if (!reactNodeIds.has(n.id())) cy.remove(n);
  });
  cy.edges().forEach(e => {
    if (e.id() === GHOST_EDGE_ID) return;
    if (!reactEdgeIds.has(e.id())) cy.remove(e);
  });

  // Add or update nodes
  reactNodes.forEach(rn => {
    if (currentNodeIds.has(rn.id)) {
      const cyNode = cy.getElementById(rn.id);
      // Only update position if it changed significantly (avoid fighting with drag)
      const cyPos = cyNode.position();
      if (rn.position && (Math.abs(cyPos.x - rn.position.x) > 1 || Math.abs(cyPos.y - rn.position.y) > 1)) {
        cyNode.position(rn.position);
      }
      cyNode.data('label', rn.data?.label || rn.id);
    } else {
      cy.add({
        group: 'nodes',
        data: { id: rn.id, label: rn.data?.label || rn.id },
        position: rn.position ? { ...rn.position } : { x: 100, y: 100 },
      });
    }
  });

  // Add or update edges
  reactEdges.forEach(re => {
    if (!currentEdgeIds.has(re.id)) {
      cy.add({
        group: 'edges',
        data: {
          id: re.id,
          source: re.source,
          target: re.target,
          sourceInterface: re.data?.sourceInterface || '',
          targetInterface: re.data?.targetInterface || '',
        },
      });
    } else {
      const cyEdge = cy.getElementById(re.id);
      cyEdge.data('sourceInterface', re.data?.sourceInterface || '');
      cyEdge.data('targetInterface', re.data?.targetInterface || '');
    }
  });
}

const CytoscapeCanvas = forwardRef(({
  nodes,
  edges,
  onNodeContextMenu,
  onEdgeContextMenu,
  onNodeDragStop,
  onNodeTap,
  connectSourceNodeId,
}, ref) => {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const callbacksRef = useRef({ onNodeContextMenu, onEdgeContextMenu, onNodeDragStop, onNodeTap });

  // Keep callbacks ref up to date
  useEffect(() => {
    callbacksRef.current = { onNodeContextMenu, onEdgeContextMenu, onNodeDragStop, onNodeTap };
  }, [onNodeContextMenu, onEdgeContextMenu, onNodeDragStop, onNodeTap]);

  useImperativeHandle(ref, () => ({
    getCy: () => cyRef.current,
    fit: () => cyRef.current?.fit(),
  }));

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: getCytoscapeStyles(),
      layout: { name: 'preset' },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    // Right-click context menu on nodes
    cy.on('cxttap', 'node', (event) => {
      const node = event.target;
      const originalEvent = event.originalEvent;
      originalEvent.preventDefault();
      callbacksRef.current.onNodeContextMenu?.(originalEvent, {
        id: node.id(),
        data: { ...node.data() },
        position: node.position(),
      });
    });

    // Right-click context menu on edges
    cy.on('cxttap', 'edge', (event) => {
      const edge = event.target;
      const originalEvent = event.originalEvent;
      originalEvent.preventDefault();
      callbacksRef.current.onEdgeContextMenu?.(originalEvent, {
        id: edge.id(),
        source: edge.data('source'),
        target: edge.data('target'),
        data: {
          sourceInterface: edge.data('sourceInterface') || '',
          targetInterface: edge.data('targetInterface') || '',
        },
      });
    });

    // Node drag stop - sync position back to React state
    cy.on('dragfree', 'node', (event) => {
      const node = event.target;
      callbacksRef.current.onNodeDragStop?.({
        id: node.id(),
        position: { ...node.position() },
      });
    });

    // Node tap - used for "Connect" mode
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      callbacksRef.current.onNodeTap?.({
        id: node.id(),
        data: { ...node.data() },
        position: node.position(),
      });
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Sync elements from React state to Cytoscape
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    syncElements(cy, nodes || [], edges || []);
  }, [nodes, edges]);

  // Handle connect mode: ghost node + dashed rubber-band edge
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clean up any previous ghost elements and classes
    cy.nodes().removeClass('connect-source connect-hover');
    const existingGhost = cy.getElementById(GHOST_NODE_ID);
    if (existingGhost.length) cy.remove(existingGhost);
    const existingGhostEdge = cy.getElementById(GHOST_EDGE_ID);
    if (existingGhostEdge.length) cy.remove(existingGhostEdge);

    if (!connectSourceNodeId) return;

    const sourceNode = cy.getElementById(connectSourceNodeId);
    if (!sourceNode.length) return;

    // Highlight the source node
    sourceNode.addClass('connect-source');

    // Add invisible ghost node at the source position initially
    const sourcePos = sourceNode.position();
    cy.add([
      {
        group: 'nodes',
        data: { id: GHOST_NODE_ID, label: '' },
        position: { x: sourcePos.x, y: sourcePos.y },
        selectable: false,
        grabbable: false,
      },
      {
        group: 'edges',
        data: { id: GHOST_EDGE_ID, source: connectSourceNodeId, target: GHOST_NODE_ID },
        selectable: false,
      },
    ]);

    // Mouse move handler - update ghost node position to follow cursor
    const container = cy.container();
    const onMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      const zoom = cy.zoom();
      const pan = cy.pan();
      const modelX = (e.clientX - rect.left - pan.x) / zoom;
      const modelY = (e.clientY - rect.top - pan.y) / zoom;

      const ghost = cy.getElementById(GHOST_NODE_ID);
      if (ghost.length) {
        ghost.position({ x: modelX, y: modelY });
      }

      // Add hover highlight to nodes under cursor (excluding source and ghost)
      cy.nodes().removeClass('connect-hover');
      const hoveredNode = cy.nodes().filter((n) => {
        if (n.id() === GHOST_NODE_ID || n.id() === connectSourceNodeId) return false;
        const bb = n.boundingBox();
        return modelX >= bb.x1 && modelX <= bb.x2 && modelY >= bb.y1 && modelY <= bb.y2;
      });
      if (hoveredNode.length) {
        hoveredNode.addClass('connect-hover');
      }
    };

    container.addEventListener('mousemove', onMouseMove);

    // Change cursor
    container.style.cursor = 'crosshair';

    return () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.style.cursor = '';
      // Clean up ghost elements on unmount / mode change
      const g = cy.getElementById(GHOST_NODE_ID);
      if (g.length) cy.remove(g);
      const ge = cy.getElementById(GHOST_EDGE_ID);
      if (ge.length) cy.remove(ge);
      cy.nodes().removeClass('connect-source connect-hover');
    };
  }, [connectSourceNodeId]);

  return (
    <div
      ref={containerRef}
      className="cytoscape-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
});

CytoscapeCanvas.displayName = 'CytoscapeCanvas';

export default CytoscapeCanvas;
