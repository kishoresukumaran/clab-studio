import React from 'react';
import { Router, HardDrive, Sparkles } from 'lucide-react';

const Sidebar = ({ onNodeClick, onGenerateClick }) => {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleNodeClick = (nodeType) => {
    if (onNodeClick) {
      onNodeClick(nodeType);
    }
  };

  return (
    <aside>
      <div className="description"><h3 className="settings-heading">Click or drag to add nodes</h3></div>
      <div className="node-buttons">
        <div
          className="node"
          onDragStart={(event) => onDragStart(event, 'router')}
          onClick={() => handleNodeClick('router')}
          draggable
          style={{ cursor: 'pointer' }}
          title="cEOS Router - Click to create or drag to position"
        >
          <Router size={24} className="node-icon" />
          <span className="node-label">Router</span>
        </div>

        <div
          className="node"
          onDragStart={(event) => onDragStart(event, 'linux-host')}
          onClick={() => handleNodeClick('linux-host')}
          draggable
          style={{ cursor: 'pointer' }}
          title="Linux Host - Click to create or drag to position"
        >
          <HardDrive size={24} className="node-icon" />
          <span className="node-label">Linux Host</span>
        </div>

        <div
          className="node"
          onClick={() => onGenerateClick && onGenerateClick()}
          style={{ cursor: 'pointer' }}
          title="Generate topology - Quick topology generation"
        >
          <Sparkles size={24} className="node-icon" />
          <span className="node-label">Generate</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
