import React, { useState } from 'react';

const SshModal = ({ isOpen, onClose, nodes, serverIp }) => {
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  if (!isOpen) return null;

  const handleConnect = (nodeName, nodeIp, nodeState, nodeKind) => {
    if (nodeState !== 'running') {
      setShowErrorModal(true);
      return;
    }
    const terminalUrl = `/terminal/${encodeURIComponent(serverIp)}/${encodeURIComponent(nodeName)}/${encodeURIComponent(nodeIp)}/${encodeURIComponent(nodeKind)}`;
    window.open(terminalUrl, '_blank');
  };

  return (
    <div className="ssh-modal">
      <div className="ssh-modal-content">
        <h2>SSH Access</h2>
        <div className="ssh-modal-table-container">
          <table className="topology-table">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Kind
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Port
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {nodes.map((node, nodeIndex) => (
                <tr key={nodeIndex} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {node.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.kind}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.image}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      node.state === 'running' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {node.state}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {node.ipAddress.map((ip, ipIdx) => (
                      <div key={ipIdx}>{ip}</div>
                    ))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button 
                      className="text-sm text-blue-600 hover:text-blue-800"
                      onClick={() => handleConnect(node.name, node.ipAddress[0], node.state, node.kind)}
                    >
                      Connect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ssh-modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      {showErrorModal && (
        <div className="modal warning-modal">
          <div className="modal-content">
            <h3>Warning</h3>
            <p>This node is not in running state, consider reconfiguring the lab</p>
            <button onClick={() => setShowErrorModal(false)}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SshModal; 