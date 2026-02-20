import React from 'react';

const LogModal = ({ isOpen, onClose, logs, title, showSuccess = false, onNavigateToServers }) => {
  if (!isOpen) return null;
  
  // Check if logs contain error messages indicating deployment failure
  const hasErrors = logs && (
    logs.toLowerCase().includes('error') || 
    logs.toLowerCase().includes('failed') || 
    logs.toLowerCase().includes('denied')
  );

  return (
    <div className="modal">
      <div className="modal-content" style={{ width: '80%', maxWidth: '800px' }}>
        <h2>{title}</h2>
        <div className="log-content" style={{ 
          maxHeight: '400px', 
          overflowY: 'auto', 
          whiteSpace: 'pre-wrap',
          backgroundColor: '#f5f5f5',
          padding: '10px',
          marginBottom: '20px',
          fontFamily: 'monospace'
        }}>
          {logs}
        </div>
        {showSuccess && !hasErrors ? (
          <div style={{ 
            marginBottom: '20px', 
            padding: '10px', 
            backgroundColor: '#e6ffe6', 
            borderRadius: '4px',
            textAlign: 'center' 
          }}>
            <p style={{ marginBottom: '10px' }}>
              Deployment successful! Please check Servers page to access the nodes.
            </p>
            <button
              onClick={onNavigateToServers}
              style={{
                backgroundColor: '#4CAF50',
                color: 'white',
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginRight: '10px'
              }}
            >
              Go to Dashboards
            </button>
          </div>
        ) : hasErrors ? (
          <div style={{ 
            marginBottom: '20px', 
            padding: '10px', 
            backgroundColor: '#ffe6e6', 
            borderRadius: '4px',
            textAlign: 'center' 
          }}>
            <p style={{ marginBottom: '10px' }}>
              Deployment failed. Please check the logs above for more details.
            </p>
          </div>
        ) : null}
        <div className="actions" style={{ textAlign: 'right' }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default LogModal;