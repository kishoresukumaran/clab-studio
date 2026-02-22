import React, { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { getCytoscapeStyles, getLayoutConfig } from './topologyStyles';
import './TopologyModal.css';

// Register the cose-bilkent layout extension once
let extensionRegistered = false;
function ensureExtensionRegistered() {
  if (!extensionRegistered) {
    try {
      cytoscape.use(coseBilkent);
      extensionRegistered = true;
    } catch (e) {
      // Already registered or unavailable — that's fine
    }
  }
}

/**
 * TopologyModal renders a fullscreen modal with a Cytoscape.js topology graph.
 *
 * Props:
 *  - isOpen        {boolean}  whether the modal is visible
 *  - onClose       {function} callback to close the modal
 *  - topologyData  {object}   parsed topology (from parseContainerlabYaml)
 *  - topologyName  {string}   display name for the topology
 */
const TopologyModal = ({ isOpen, onClose, topologyData, topologyName }) => {
  const cyRef = useRef(null);       // Cytoscape instance
  const containerRef = useRef(null); // DOM container
  const [infoPanel, setInfoPanel] = useState(null); // { type, data }
  const [edgeLabelsVisible, setEdgeLabelsVisible] = useState(true);

  // Determine if cose-bilkent is available
  const coseBilkentAvailable = useRef(true);

  // ---- Initialise / destroy Cytoscape ----
  useEffect(() => {
    if (!isOpen || !topologyData || !containerRef.current) return;

    ensureExtensionRegistered();

    // Small delay so the DOM container has dimensions
    const timer = setTimeout(() => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }

      try {
        const cy = cytoscape({
          container: containerRef.current,
          elements: [
            ...topologyData.elements.nodes,
            ...topologyData.elements.edges,
          ],
          style: getCytoscapeStyles(),
          layout: getLayoutConfig(coseBilkentAvailable.current),
          userZoomingEnabled: true,
          userPanningEnabled: true,
          boxSelectionEnabled: false,
          selectionType: 'single',
          autoungrabify: false,
          autounselectify: false,
        });

        // Node click
        cy.on('tap', 'node', (evt) => {
          const data = evt.target.data();
          setInfoPanel({ type: 'node', data });
        });

        // Edge click
        cy.on('tap', 'edge', (evt) => {
          const data = evt.target.data();
          setInfoPanel({ type: 'edge', data });
        });

        // Background click — close info panel
        cy.on('tap', (evt) => {
          if (evt.target === cy) {
            setInfoPanel(null);
          }
        });

        // Double-click node — fit to view
        cy.on('dbltap', 'node', (evt) => {
          cy.fit(evt.target, 100);
        });

        cyRef.current = cy;
      } catch (err) {
        // If cose-bilkent failed, retry with built-in cose
        if (coseBilkentAvailable.current) {
          coseBilkentAvailable.current = false;
          const cy = cytoscape({
            container: containerRef.current,
            elements: [
              ...topologyData.elements.nodes,
              ...topologyData.elements.edges,
            ],
            style: getCytoscapeStyles(),
            layout: getLayoutConfig(false),
            userZoomingEnabled: true,
            userPanningEnabled: true,
            selectionType: 'single',
          });
          cyRef.current = cy;
        }
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      setInfoPanel(null);
      setEdgeLabelsVisible(true);
    };
  }, [isOpen, topologyData]);

  // ---- Toolbar actions ----

  const fitToView = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.fit();
      cyRef.current.center();
    }
  }, []);

  const resetLayout = useCallback(() => {
    if (cyRef.current) {
      const layout = cyRef.current.layout(
        getLayoutConfig(coseBilkentAvailable.current, true)
      );
      layout.run();
    }
  }, []);

  const toggleEdgeLabels = useCallback(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (edgeLabelsVisible) {
      cy.edges().style({ 'source-label': '', 'target-label': '' });
    } else {
      cy.edges().style({
        'source-label': 'data(source_interface)',
        'target-label': 'data(target_interface)',
      });
    }
    setEdgeLabelsVisible((v) => !v);
  }, [edgeLabelsVisible]);

  const exportPng = useCallback(() => {
    if (!cyRef.current) return;
    try {
      const png = cyRef.current.png({ output: 'blob', bg: 'white', full: true, scale: 2 });
      const link = document.createElement('a');
      link.download = `${topologyName || 'topology'}.png`;
      link.href = URL.createObjectURL(png);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Export PNG failed:', e);
    }
  }, [topologyName]);

  // ---- Render helpers ----

  const renderInfoItem = (label, value) => {
    if (!value) return null;
    return (
      <div className="topo-info-item" key={label}>
        <div className="topo-info-label">{label}:</div>
        <div className="topo-info-value">{String(value)}</div>
      </div>
    );
  };

  const renderNodeInfo = (data) => (
    <>
      {renderInfoItem('Name', data.label)}
      {renderInfoItem('Type', data.kind)}
      {renderInfoItem('Topology', data.topo_name)}
      {renderInfoItem('Container', data.container_name)}
      {renderInfoItem('FQDN', data.fqdn)}
      {data.config && (
        <>
          {renderInfoItem('Image', data.config.image)}
          {renderInfoItem('Kind', data.config.kind)}
          {renderInfoItem('Startup Config', data.config['startup-config'])}
          {data.config.env && renderInfoItem('Environment', JSON.stringify(data.config.env, null, 2))}
          {data.config.binds && data.config.binds.length > 0 && renderInfoItem('Binds', data.config.binds.join('\n'))}
          {data.config.exec && data.config.exec.length > 0 && renderInfoItem('Exec Commands', data.config.exec.join('\n'))}
        </>
      )}
    </>
  );

  const renderEdgeInfo = (data) => (
    <>
      {renderInfoItem('Source Node', data.source)}
      {renderInfoItem('Target Node', data.target)}
      {renderInfoItem('Source Interface', data.source_interface)}
      {renderInfoItem('Target Interface', data.target_interface)}
    </>
  );

  // ---- Don't render if closed ----
  if (!isOpen) return null;

  const stats = topologyData?.stats;

  return (
    <div className="topology-modal-overlay" onClick={onClose}>
      <div
        className="topology-modal-container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="topology-modal-header">
          <h2>{topologyName || 'Network Topology'}</h2>

          {stats && (
            <div className="topology-modal-stats">
              <span className="topology-modal-stat">
                Nodes: <span>{stats.node_count}</span>
              </span>
              <span className="topology-modal-stat">
                Links: <span>{stats.link_count}</span>
              </span>
              <span className="topology-modal-stat">
                Types: <span>{stats.node_types.join(', ')}</span>
              </span>
            </div>
          )}

          <div className="topology-modal-toolbar">
            <button className="topo-ctrl-btn" title="Fit View" onClick={fitToView}>
              🔍
            </button>
            <button className="topo-ctrl-btn" title="Reset Layout" onClick={resetLayout}>
              🔄
            </button>
            <button
              className="topo-ctrl-btn"
              title={edgeLabelsVisible ? 'Hide Labels' : 'Show Labels'}
              onClick={toggleEdgeLabels}
            >
              🏷️
            </button>
            <button className="topo-ctrl-btn" title="Export PNG" onClick={exportPng}>
              📷
            </button>
            <button className="topo-close-btn" title="Close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="topology-modal-canvas" ref={containerRef}>
          {!topologyData && (
            <div className="topology-modal-placeholder">
              <div className="placeholder-icon">🌐</div>
              <h3>No Topology Loaded</h3>
              <p>Select a topology from the dashboard</p>
            </div>
          )}

          {/* Info panel */}
          {infoPanel && (
            <div className="topo-info-panel">
              <div className="topo-info-header">
                <h3>
                  {infoPanel.type === 'node'
                    ? `Node: ${infoPanel.data.label}`
                    : 'Link Information'}
                </h3>
                <button
                  className="topo-info-close"
                  onClick={() => setInfoPanel(null)}
                >
                  ✕
                </button>
              </div>
              <div className="topo-info-body">
                {infoPanel.type === 'node'
                  ? renderNodeInfo(infoPanel.data)
                  : renderEdgeInfo(infoPanel.data)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopologyModal;
