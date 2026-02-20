import React from "react";

const NodePanel = () => {
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData("application/reactflow", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="node-panel">
      <h3>Available Nodes</h3>
      <div
        className="node"
        draggable
        onDragStart={(event) => onDragStart(event, "input")}
      >
        Input Node
      </div>
      <div
        className="node"
        draggable
        onDragStart={(event) => onDragStart(event, "default")}
      >
        Default Node
      </div>
      <div
        className="node"
        draggable
        onDragStart={(event) => onDragStart(event, "output")}
      >
        Output Node
      </div>
    </aside>
  );
};

export default NodePanel;
