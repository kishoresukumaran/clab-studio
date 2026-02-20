import React, { useState, useEffect, useRef } from 'react';
import { Folder, File, ChevronRight, ChevronDown, ArrowUp, Upload, Trash, Plus, PlusCircle, FileText, Copy, Clipboard, Pencil, Check, Edit } from 'lucide-react';
import pathBrowserify from 'path-browserify';
import { getClabServers, BACKEND_API_URL, SERVER_IP } from '../utils/config';

// Path utility functions
const getBasename = (filepath) => {
  return pathBrowserify.basename(filepath);
};

const getDirname = (filepath) => {
  return pathBrowserify.dirname(filepath);
};

const FileManagerModal = ({ isOpen, onClose, onImport, username, mode, title }) => {
  const [servers, setServers] = useState(getClabServers());
  const [expandedServers, setExpandedServers] = useState({});
  const [fileContents, setFileContents] = useState({});
  const [currentPaths, setCurrentPaths] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  
  // New state for multi-select functionality
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDialogType, setCreateDialogType] = useState('folder'); // 'folder' or 'file'
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [newFileContent, setNewFileContent] = useState('');
  const [activeServer, setActiveServer] = useState(null);
  const fileInputRef = useRef(null);
  const [copiedItem, setCopiedItem] = useState(null); // New state for copied item
  const [copiedItems, setCopiedItems] = useState([]); // New state for multiple copied items
  const [showRenameDialog, setShowRenameDialog] = useState(false); // State for rename dialog
  const [itemToRename, setItemToRename] = useState(null); // Stores { serverIp, path, isDirectory, name }
  const [newDisplayName, setNewDisplayName] = useState(''); // New name entered by user
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [fileToEdit, setFileToEdit] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isSaveAs, setIsSaveAs] = useState(false);
  const [gitRepoUrl, setGitRepoUrl] = useState('');

  useEffect(() => {
    const initialPaths = {};
    const initialExpandedState = {};
    
    servers.forEach(server => {
      initialPaths[server.ip] = `/home/clab_nfs_share/containerlab_topologies/${username}`;
      // initialPaths[server.ip] = `/home/${username}/.clab`;
      initialExpandedState[server.ip] = true; // Always expanded by default
    });
    
    setCurrentPaths(initialPaths);
    setExpandedServers(initialExpandedState);
    
    // Initialize the default server (clab-ire-3) for different modes
    // This ensures file management buttons work by setting the activeServer state
    if (mode === 'import' || mode === 'select' || mode === 'manage') {
      const clabIre3 = servers.find(server => server.name === 'clab-ire-3');
      if (clabIre3) {
        const defaultImportPath = `/home/clab_nfs_share/containerlab_topologies/${username}`;
        // const defaultImportPath = `/home/${username}/.clab`;
        setCurrentPaths(prev => ({ ...prev, [clabIre3.ip]: defaultImportPath }));
        fetchContents(clabIre3.ip, defaultImportPath);
        setActiveServer(clabIre3.ip); // Set active server for import/select mode
      }
      
      // Also fetch content for other servers
      servers.filter(server => server.name !== 'clab-ire-3').forEach(server => {
        fetchContents(server.ip, initialPaths[server.ip]);
      });
    } else if (mode === 'save') {
      const clabIre3 = servers.find(server => server.name === 'clab-ire-3');
      if (clabIre3) {
        const initialPath = `/home/clab_nfs_share/containerlab_topologies/${username}`;
        // const initialPath = `/home/${username}/.clab`;
        setSelectedFile({ serverIp: clabIre3.ip, path: initialPath });
        fetchContents(clabIre3.ip, initialPath);
        setActiveServer(clabIre3.ip); // Set active server for save mode
      }
      
      // Also fetch content for other servers
      servers.filter(server => server.name !== 'clab-ire-3').forEach(server => {
        fetchContents(server.ip, initialPaths[server.ip]);
      });
    }
  }, [servers, username, mode]);

  // Add keyframes animation for the refresh icon
  useEffect(() => {
    // Create a style element
    const styleEl = document.createElement('style');
    styleEl.setAttribute('id', 'file-manager-animations');
    
    // Add the keyframes animation
    styleEl.innerHTML = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    
    // Add it to the document head if it doesn't exist already
    if (!document.getElementById('file-manager-animations')) {
      document.head.appendChild(styleEl);
    }
    
    // Clean up on unmount
    return () => {
      const existingStyle = document.getElementById('file-manager-animations');
      if (existingStyle && document.head.contains(existingStyle)) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);

  // Instead, create a function to set active server without toggling visibility
  const setServerActive = (serverIp) => {
    setActiveServer(serverIp);
  };

  const fetchContents = async (serverIp, path) => {
    try {
      setLoading(true);
      // Set loading state for this specific server
      setFileContents(prev => ({
        ...prev,
        [`${serverIp}:${path}`]: [{ name: 'Loading...', type: 'loading', path: '' }]
      }));
      
      console.log(`Fetching from: http://${serverIp}:3001/api/files/list?path=${encodeURIComponent(path)}&serverIp=${encodeURIComponent(serverIp)}&username=${encodeURIComponent(username)}`);
      
      const response = await fetch(`http://${serverIp}:3001/api/files/list?path=${encodeURIComponent(path)}&serverIp=${encodeURIComponent(serverIp)}&username=${encodeURIComponent(username)}`);
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const text = await response.text();
        console.error('Error response:', text);
        throw new Error(`Server responded with ${response.status}: ${text.substring(0, 100)}...`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setFileContents(prev => ({
          ...prev,
          [`${serverIp}:${path}`]: data.contents
        }));
      } else {
        console.error('Failed to fetch contents:', data.error);
        // Show error message in the file list
        setFileContents(prev => ({
          ...prev,
          [`${serverIp}:${path}`]: [{ name: `Error: ${data.error}`, type: 'error', path: '' }]
        }));
      }
    } catch (error) {
      console.error('Error fetching contents:', error);
      // Show error message in the file list
      setFileContents(prev => ({
        ...prev,
        [`${serverIp}:${path}`]: [{ name: `Error: ${error.message}`, type: 'error', path: '' }]
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleFolderDoubleClick = async (serverIp, path) => {
    const newPath = path;
    setCurrentPaths(prev => ({
      ...prev,
      [serverIp]: newPath
    }));
    
    // Set active server when navigating to a folder
    setActiveServer(serverIp);
    
    await fetchContents(serverIp, newPath);
    
    if (mode === 'save') {
      setSelectedFile({ serverIp, path: newPath });
    }
    setSelectedFolder(null);
  };

  const handleFolderClick = (serverIp, path, event) => {
    // Set active server when clicking on a folder
    setActiveServer(serverIp);
    
    // Check if Ctrl/Cmd key is pressed for multi-select
    const isMultiSelectKey = event && (event.ctrlKey || event.metaKey);
    
    if (isMultiSelectKey || multiSelectMode) {
      // Toggle selection in multi-select mode
      const itemKey = `${serverIp}:${path}`;
      const itemIndex = selectedItems.findIndex(item => 
        item.serverIp === serverIp && item.path === path
      );
      
      if (itemIndex >= 0) {
        // Item already selected, remove it
        setSelectedItems(selectedItems.filter((_, index) => index !== itemIndex));
      } else {
        // Add item to selection
        setSelectedItems([...selectedItems, { 
          serverIp, 
          path, 
          isDirectory: true,
          name: path.split('/').pop()
        }]);
      }
    } else {
      // Single select mode
      if (selectedFolder?.serverIp === serverIp && selectedFolder?.path === path) {
        setSelectedFolder(null);
      } else {
        setSelectedFolder({ serverIp, path });
      }
      setSelectedFile(null);
      // Clear multi-select when clicking without modifier key
      setSelectedItems([]);
    }
  };

  const handleFileClick = (serverIp, path, event) => {
    console.log('handleFileClick called with path:', path);
    
    // Set active server when clicking on a file
    setActiveServer(serverIp);
    
    // Check if Ctrl/Cmd key is pressed for multi-select
    const isMultiSelectKey = event && (event.ctrlKey || event.metaKey);
    
    if (isMultiSelectKey || multiSelectMode) {
      // Toggle selection in multi-select mode
      const itemKey = `${serverIp}:${path}`;
      const itemIndex = selectedItems.findIndex(item => 
        item.serverIp === serverIp && item.path === path
      );
      
      if (itemIndex >= 0) {
        // Item already selected, remove it
        setSelectedItems(selectedItems.filter((_, index) => index !== itemIndex));
      } else {
        // Add item to selection
        setSelectedItems([...selectedItems, { 
          serverIp, 
          path, 
          isDirectory: false,
          name: path.split('/').pop()
        }]);
      }
    } else {
      // Single select mode
      if (mode === 'import' || mode === 'select') {
        setSelectedFile({ serverIp, path });
      } else if (mode === 'save') {
        setSelectedFile({ serverIp, path: currentPaths[serverIp] });
      } else if (mode === 'manage') {
        setSelectedFile({ serverIp, path });
      }
      setSelectedFolder(null);
      // Clear multi-select when clicking without modifier key
      setSelectedItems([]);
    }
  };

  const handleImport = async () => {
    if (mode === 'import') {
      if (!selectedFile) return;

      try {
        setLoading(true);
        const response = await fetch(`http://${selectedFile.serverIp}:3001/api/files/read?path=${encodeURIComponent(selectedFile.path)}&serverIp=${encodeURIComponent(selectedFile.serverIp)}&username=${encodeURIComponent(username)}`);
        
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Server responded with ${response.status}: ${text.substring(0, 100)}...`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          onImport(data.content);
          onClose();
        } else {
          console.error('Failed to read file:', data.error);
        }
      } catch (error) {
        console.error('Error reading file:', error);
      } finally {
        setLoading(false);
      }
    } else if (mode === 'select') {
      if (!selectedFile) return;
      onImport(null, selectedFile);
      onClose();
    } else {
      if (!selectedFile) return;
      onImport(null, { serverIp: selectedFile.serverIp, path: selectedFile.path });
    }
  };

  const navigateUp = async (serverIp) => {
    const currentPath = currentPaths[serverIp];
    const parentPath = currentPath.split('/').slice(0, -1).join('/');
    const newPath = parentPath || '/';
    
    setCurrentPaths(prev => ({
      ...prev,
      [serverIp]: newPath
    }));
    
    // Set active server when navigating
    setActiveServer(serverIp);
    
    await fetchContents(serverIp, newPath);
    
    if (mode === 'save') {
      setSelectedFile({ serverIp, path: newPath });
    }
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event, serverIp) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('serverIp', serverIp);
      formData.append('targetDirectory', currentPaths[serverIp]);
      formData.append('username', username);
      
      const response = await fetch(`http://${serverIp}:3001/api/files/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload file');
      }
      
      const data = await response.json();
      
      if (data.success) {
        alert('File uploaded successfully');
        await fetchContents(serverIp, currentPaths[serverIp]);
      } else {
        alert(`Failed to upload file: ${data.error}`);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Error uploading file: ${error.message}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCopy = () => {
    if (selectedItems.length > 0) {
      // Multi-select mode
      setCopiedItems([...selectedItems]);
      alert(`${selectedItems.length} items copied.`);
    } else if (selectedFile) {
      // Single file selection
      setCopiedItem({ 
        serverIp: selectedFile.serverIp, 
        path: selectedFile.path, 
        isDirectory: false, 
        name: selectedFile.path.split('/').pop() 
      });
      alert(`File ${selectedFile.path.split('/').pop()} copied.`);
    } else if (selectedFolder) {
      // Single folder selection
      setCopiedItem({ 
        serverIp: selectedFolder.serverIp, 
        path: selectedFolder.path, 
        isDirectory: true, 
        name: selectedFolder.path.split('/').pop() 
      });
      alert(`Folder ${selectedFolder.path.split('/').pop()} copied.`);
    } else {
      alert('Please select a file or folder to copy.');
    }
  };

  const handleDeleteFile = async () => {
    if (selectedItems.length > 0) {
      // Multi-select mode
      const confirmMessage = `Are you sure you want to delete these ${selectedItems.length} items?`;
      if (!window.confirm(confirmMessage)) return;
      
      setLoading(true);
      let successCount = 0;
      let errorCount = 0;
      
      for (const item of selectedItems) {
        try {
          const response = await fetch(`http://${item.serverIp}:3001/api/files/delete`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              serverIp: item.serverIp,
              path: item.path,
              isDirectory: item.isDirectory,
              username: username
            })
          });
          
          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error('Error deleting item:', error);
          errorCount++;
        }
      }
      
      setLoading(false);
      
      if (errorCount === 0) {
        alert(`Successfully deleted ${successCount} items.`);
      } else {
        alert(`Deleted ${successCount} items. Failed to delete ${errorCount} items.`);
      }
      
      // Refresh the current directory
      if (activeServer) {
        await fetchContents(activeServer, currentPaths[activeServer]);
      }
      
      // Clear selection
      setSelectedItems([]);
      
    } else if (selectedFile || selectedFolder) {
      // Single item selection
      const itemToDelete = selectedFile || selectedFolder;

      const isDirectory = itemToDelete === selectedFolder || fileContents[`${itemToDelete.serverIp}:${currentPaths[itemToDelete.serverIp]}`]?.find(
        item => item.path === itemToDelete.path
      )?.type === 'directory';
      
      const confirmMessage = `Are you sure you want to delete this ${isDirectory ? 'directory' : 'file'}?`;
      if (!window.confirm(confirmMessage)) return;
      
      try {
        setLoading(true);
        
        const response = await fetch(`http://${itemToDelete.serverIp}:3001/api/files/delete`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverIp: itemToDelete.serverIp,
            path: itemToDelete.path,
            isDirectory,
            username: username
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete file/directory');
        }
        
        const data = await response.json();
        
        if (data.success) {
          alert(`${isDirectory ? 'Directory' : 'File'} deleted successfully`);
          await fetchContents(itemToDelete.serverIp, currentPaths[itemToDelete.serverIp]);
          setSelectedFile(null);
          setSelectedFolder(null);
        } else {
          alert(`Failed to delete ${isDirectory ? 'directory' : 'file'}: ${data.error}`);
        }
      } catch (error) {
        console.error('Error deleting file/directory:', error);
        alert(`Error deleting ${isDirectory ? 'directory' : 'file'}: ${error.message}`);
      } finally {
        setLoading(false);
      }
    } else {
      alert('Please select a file or folder to delete.');
    }
  };

  const handlePaste = async () => {
    if (copiedItems && copiedItems.length > 0) {
      // Multi-item paste
      if (!activeServer || !currentPaths[activeServer]) {
        alert('No destination selected.');
        return;
      }

      setLoading(true);
      let successCount = 0;
      let errorCount = 0;
      
      for (const item of copiedItems) {
        try {
          const response = await fetch(`http://${activeServer}:3001/api/files/copyPaste`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sourceServerIp: item.serverIp,
              sourcePath: item.path,
              isDirectory: item.isDirectory,
              destinationServerIp: activeServer,
              destinationPath: currentPaths[activeServer],
              username: username
            })
          });

          if (response.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error('Error pasting item:', error);
          errorCount++;
        }
      }
      
      setLoading(false);
      
      if (errorCount === 0) {
        alert(`Successfully pasted ${successCount} items to ${currentPaths[activeServer]}`);
      } else {
        alert(`Pasted ${successCount} items. Failed to paste ${errorCount} items.`);
      }
      
      // Refresh the destination folder
      await fetchContents(activeServer, currentPaths[activeServer]);
      
      // Clear copied items after successful paste
      setCopiedItems([]);
      
    } else if (copiedItem && activeServer && currentPaths[activeServer]) {
      // Single item paste
      try {
        setLoading(true);
        const response = await fetch(`http://${activeServer}:3001/api/files/copyPaste`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sourceServerIp: copiedItem.serverIp,
            sourcePath: copiedItem.path,
            isDirectory: copiedItem.isDirectory,
            destinationServerIp: activeServer, // Assuming paste on the same server
            destinationPath: currentPaths[activeServer],
            username: username
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to paste item');
        }

        const data = await response.json();
        if (data.success) {
          alert(`Item pasted successfully to ${currentPaths[activeServer]}`);
          setCopiedItem(null); // Clear copied item after successful paste
          await fetchContents(activeServer, currentPaths[activeServer]); // Refresh destination folder
        } else {
          alert(`Failed to paste item: ${data.error}`);
        }
      } catch (error) {
        console.error('Error pasting item:', error);
        alert(`Error pasting item: ${error.message}`);
      } finally {
        setLoading(false);
      }
    } else {
      alert('Nothing to paste or no destination selected.');
    }
  };

  const handleRenameClick = () => {
    if (selectedFile) {
      setItemToRename({ serverIp: selectedFile.serverIp, path: selectedFile.path, isDirectory: false, name: selectedFile.path.split('/').pop() });
      setNewDisplayName(selectedFile.path.split('/').pop());
      setShowRenameDialog(true);
    } else if (selectedFolder) {
      setItemToRename({ serverIp: selectedFolder.serverIp, path: selectedFolder.path, isDirectory: true, name: selectedFolder.path.split('/').pop() });
      setNewDisplayName(selectedFolder.path.split('/').pop());
      setShowRenameDialog(true);
    } else {
      alert('Please select a file or folder to rename.');
    }
  };

  const handleRenameConfirm = async () => {
    if (!itemToRename) return;

    try {
      setLoading(true);
      const response = await fetch(`http://${itemToRename.serverIp}:3001/api/files/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverIp: itemToRename.serverIp,
          oldPath: itemToRename.path,
          newPath: `${currentPaths[itemToRename.serverIp]}/${newDisplayName}`,
          username: username
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to rename file/directory');
      }

      const data = await response.json();
      
      if (data.success) {
        alert(`${itemToRename.isDirectory ? 'Directory' : 'File'} renamed successfully`);
        await fetchContents(itemToRename.serverIp, itemToRename.path);
        setShowRenameDialog(false);
      } else {
        alert(`Failed to rename ${itemToRename.isDirectory ? 'directory' : 'file'}: ${data.error}`);
      }
    } catch (error) {
      console.error('Error renaming file/directory:', error);
      alert(`Error renaming ${itemToRename.isDirectory ? 'directory' : 'file'}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getModalTitle = () => {
    if (title) return title;
    
    switch (mode) {
      case 'import':
        return 'Import Topology File';
      case 'save':
        return 'Select Directory to Save Topology File';
      case 'select':
        if (selectedFile?.path?.includes('bind')) {
          return 'Select Source Path';
        }
        return 'Select Startup Config File';
      default:
        return 'File Manager';
    }
  };

  const openCreateFolderDialog = (serverIp) => {
    setActiveServer(serverIp);
    setCreateDialogType('folder');
    setNewFolderName('');
    setShowCreateDialog(true);
  };

  const openCreateFileDialog = (serverIp) => {
    setActiveServer(serverIp);
    setCreateDialogType('file');
    setNewFileName('');
    setNewFileContent('');
    setShowCreateDialog(true);
  };

  const handleCreateFolder = async () => {
    if (!activeServer || !newFolderName) return;

    try {
      setLoading(true);
      const response = await fetch(`http://${activeServer}:3001/api/files/createDirectory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverIp: activeServer,
          path: currentPaths[activeServer],
          directoryName: newFolderName,
          username: username
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create folder');
      }

      const data = await response.json();
      if (data.success) {
        alert('Folder created successfully');
        setShowCreateDialog(false);
        await fetchContents(activeServer, currentPaths[activeServer]);
      } else {
        alert(`Failed to create folder: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating folder:', error);
      alert(`Error creating folder: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFile = async () => {
    if (!activeServer || !newFileName) return;

    try {
      setLoading(true);
      const response = await fetch(`http://${activeServer}:3001/api/files/createFile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          serverIp: activeServer,
          path: currentPaths[activeServer],
          fileName: newFileName,
          content: newFileContent,
          username: username
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create file');
      }

      const data = await response.json();
      if (data.success) {
        alert('File created successfully');
        setShowCreateDialog(false);
        await fetchContents(activeServer, currentPaths[activeServer]);
      } else {
        alert(`Failed to create file: ${data.error}`);
      }
    } catch (error) {
      console.error('Error creating file:', error);
      alert(`Error creating file: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = async () => {
    if (!selectedFile || selectedItems.length > 0 || selectedFolder) return;
    
    try {
      setLoading(true);
      const response = await fetch(`http://${selectedFile.serverIp}:3001/api/files/read?path=${encodeURIComponent(selectedFile.path)}&serverIp=${encodeURIComponent(selectedFile.serverIp)}&username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to read file');
      }

      const data = await response.json();
      if (data.success) {
        setFileToEdit(selectedFile);
        setFileContent(data.content);
        setNewFileName('');
        setIsSaveAs(false);
        setShowEditDialog(true);
      } else {
        alert(`Failed to read file: ${data.error}`);
      }
    } catch (error) {
      console.error('Error reading file for editing:', error);
      alert(`Error reading file: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFile = async (saveAs = false) => {
    if (!fileToEdit) return;
    
    try {
      setLoading(true);
      
      // Create a temporary file with the content
      const blob = new Blob([fileContent], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, saveAs && newFileName ? newFileName : getBasename(fileToEdit.path));
      
      let targetPath;
      if (saveAs && newFileName) {
        // For "Save As", use the directory of the original file
        targetPath = getDirname(fileToEdit.path);
      } else {
        // For regular save, we'll delete the original file first
        const deleteResponse = await fetch(`http://${fileToEdit.serverIp}:3001/api/files/delete`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            serverIp: fileToEdit.serverIp,
            path: fileToEdit.path,
            isDirectory: false,
            username: username
          })
        });
        
        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json();
          throw new Error(errorData.error || 'Failed to delete original file');
        }
        
        // Use the directory of the original file
        targetPath = getDirname(fileToEdit.path);
      }
      
      formData.append('serverIp', fileToEdit.serverIp);
      formData.append('path', targetPath);
      formData.append('username', username);
      
      const response = await fetch(`http://${fileToEdit.serverIp}:3001/api/files/save`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save file');
      }

      const data = await response.json();
      if (data.success) {
        alert('File saved successfully');
        setShowEditDialog(false);
        
        // Refresh the current directory
        await fetchContents(activeServer, currentPaths[activeServer]);
      } else {
        alert(`Failed to save file: ${data.error}`);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      alert(`Error saving file: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleSaveAs = () => {
    setIsSaveAs(!isSaveAs);
    if (!isSaveAs) {
      // When enabling Save As, initialize with the current filename
      setNewFileName(getBasename(fileToEdit.path));
    }
  };

  const handleGitImport = async () => {
    if (!gitRepoUrl.trim()) {
      alert('Please enter a git repository URL');
      return;
    }
    
    try {
      setLoading(true);
      
      // Create a modal for logs
      const logModalDiv = document.createElement('div');
      logModalDiv.style.position = 'fixed';
      logModalDiv.style.top = '50%';
      logModalDiv.style.left = '50%';
      logModalDiv.style.transform = 'translate(-50%, -50%)';
      logModalDiv.style.backgroundColor = 'white';
      logModalDiv.style.padding = '20px';
      logModalDiv.style.borderRadius = '8px';
      logModalDiv.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
      logModalDiv.style.zIndex = '10000';
      logModalDiv.style.width = '80%';
      logModalDiv.style.maxWidth = '600px';
      logModalDiv.style.maxHeight = '80vh';
      logModalDiv.style.overflow = 'auto';
      
      const header = document.createElement('h3');
      header.textContent = 'Git Clone Operation';
      header.style.marginTop = '0';
      header.style.marginBottom = '15px';
      
      const logContent = document.createElement('pre');
      logContent.style.backgroundColor = '#f5f5f5';
      logContent.style.padding = '10px';
      logContent.style.borderRadius = '4px';
      logContent.style.maxHeight = '60vh';
      logContent.style.overflow = 'auto';
      logContent.style.whiteSpace = 'pre-wrap';
      logContent.style.fontSize = '14px';
      logContent.style.color = '#333';
      
      logModalDiv.appendChild(header);
      logModalDiv.appendChild(logContent);
      document.body.appendChild(logModalDiv);
      
      const appendLog = (message) => {
        logContent.textContent += message;
        logContent.scrollTop = logContent.scrollHeight;
      };
      
      // Prepare the request - Use the correct API endpoint URL and username prop
      const response = await fetch(`${BACKEND_API_URL}/api/git/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gitRepoUrl: gitRepoUrl.trim(),
          username: username || 'admin'  // Use the username prop directly
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      // Process the streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      let responseText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        // Decode the chunk and append to the log
        const chunk = decoder.decode(value, { stream: true });
        responseText += chunk;
        appendLog(chunk);
      }
      
      // Add a success message
      appendLog('\nRepository cloned successfully!\n');
      
      // Add a close button to the modal
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.padding = '8px 16px';
      closeButton.style.backgroundColor = '#072452';
      closeButton.style.color = 'white';
      closeButton.style.border = 'none';
      closeButton.style.borderRadius = '4px';
      closeButton.style.cursor = 'pointer';
      closeButton.style.marginTop = '15px';
      closeButton.onclick = () => {
        document.body.removeChild(logModalDiv);
      };
      
      logModalDiv.appendChild(closeButton);
      
    } catch (error) {
      console.error('Error during git import:', error);
      setLoading(false);
      alert(`Error during git import: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="file-manager-modal-content">
        <h2>{getModalTitle()}</h2>
        
        {/* Add multi-select toggle button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <button 
              onClick={() => setMultiSelectMode(!multiSelectMode)}
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '5px', 
                padding: '6px 12px',
                backgroundColor: multiSelectMode ? '#4CAF50' : '#f0f0f0',
                color: multiSelectMode ? 'white' : 'black',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {multiSelectMode ? <Check size={16} /> : null}
              Multi-Select {multiSelectMode ? 'ON' : 'OFF'}
            </button>
          </div>
          {selectedItems.length > 0 && (
            <div style={{ fontSize: '14px', color: '#666' }}>
              {selectedItems.length} item{selectedItems.length > 1 ? 's' : ''} selected
            </div>
          )}
        </div>

        {/* Import from git repo section */}
        {(mode === 'import' || mode === 'manage') && (
          <div style={{ 
            marginBottom: '15px', 
            padding: '10px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '4px',
            border: '1px solid #e9ecef'
          }}>
            <h3 style={{ marginTop: '0', marginBottom: '10px', fontSize: '16px', fontWeight: '600' }}>Clone from git repo</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={gitRepoUrl}
                onChange={(e) => setGitRepoUrl(e.target.value)}
                placeholder="Enter git repository URL"
                style={{ 
                  flex: '1', 
                  padding: '8px 10px', 
                  border: '1px solid #ced4da', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={handleGitImport}
                disabled={loading || !gitRepoUrl.trim()}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#072452',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  opacity: loading || !gitRepoUrl.trim() ? '0.7' : '1',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!loading && gitRepoUrl.trim()) {
                    e.currentTarget.style.backgroundColor = '#0a3270';
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#072452';
                }}
              >
                {loading ? 'Cloning...' : 'Clone'}
              </button>
            </div>
          </div>
        )}
        
        <div className="file-manager" style={{ maxHeight: 'calc(80vh - 180px)', overflowY: 'auto', paddingBottom: '20px' }}>
          {(mode === 'import' || mode === 'save' || mode === 'select' || mode === 'manage') ? (
            <>
              {servers
                .filter(server => server.name === 'clab-ire-3')
                .map(server => (
                  <div key={server.ip} className="server-section">
                    <div 
                      className="server-header" 
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <FileText size={20} />
                      <span title={`Shared NFS directory from ${SERVER_IP}`}>Shared directory</span>
                    </div>
                    <div className="server-contents" style={{ marginLeft: '20px' }}>
                      <div className="path-navigation" style={{ display: 'flex', alignItems: 'center', margin: '10px 0', gap: '10px' }}>
                        <button 
                          onClick={() => navigateUp(server.ip)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '5px',
                            padding: '4px 8px',
                            border: '1px solid #3b82f6',
                            borderRadius: '4px',
                            background: '#3b82f6',
                            color: 'white',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = '#2563eb';
                            e.currentTarget.style.borderColor = '#2563eb';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = '#3b82f6';
                            e.currentTarget.style.borderColor = '#3b82f6';
                          }}
                        >
                          <ArrowUp size={16} /> Up
                        </button>
                        <div 
                          style={{ 
                            overflowX: 'auto', 
                            whiteSpace: 'nowrap', 
                            padding: '5px', 
                            border: mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip] 
                              ? '2px solid #10b981' 
                              : '1px solid #eee', 
                            borderRadius: '4px', 
                            flexGrow: 1,
                            backgroundColor: mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip]
                              ? '#d1fae5'
                              : 'transparent'
                          }}
                        >
                          {currentPaths[server.ip]}
                          {mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip] && (
                            <span style={{ marginLeft: '10px', color: '#047857', fontWeight: 'bold' }}>
                              (Selected for saving)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Show file management options for import, save, select, and manage modes */}
                      {(mode === 'import' || mode === 'save' || mode === 'select' || mode === 'manage') && (
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                          {selectedItems.length === 0 && (
                            <>
                              <button
                                onClick={() => openCreateFolderDialog(server.ip)}
                                disabled={!activeServer || activeServer !== server.ip}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                              >
                                <Plus size={16} /> Folder
                              </button>
                              <button
                                onClick={() => openCreateFileDialog(server.ip)}
                                disabled={!activeServer || activeServer !== server.ip}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                              >
                                <PlusCircle size={16} /> File
                              </button>
                            </>
                          )}
                          <button
                            onClick={handleCopy}
                            disabled={(!selectedItems.length > 0 && !selectedFile && !selectedFolder) || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                          >
                            <Copy size={16} /> Copy
                          </button>
                          {selectedItems.length === 0 && (
                            <button
                              onClick={handlePaste}
                              disabled={(!copiedItems?.length && !copiedItem) || activeServer !== server.ip}
                              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                            >
                              <Clipboard size={16} /> Paste
                            </button>
                          )}
                          <button
                            onClick={handleDeleteFile}
                            disabled={(!selectedItems.length > 0 && !selectedFile && !selectedFolder) || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: '#dc3545', color: 'white' }}
                          >
                            <Trash size={16} /> Delete
                          </button>
                          {selectedItems.length === 0 && (
                            <>
                              <button
                                onClick={handleRenameClick}
                                disabled={(!selectedFile && !selectedFolder) || activeServer !== server.ip}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                              >
                                <Pencil size={16} /> Rename
                              </button>
                              <button
                                onClick={handleEditClick}
                                disabled={!selectedFile || selectedFolder || activeServer !== server.ip}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                              >
                                <Edit size={16} /> Edit
                              </button>
                              <input
                                type="file"
                                ref={fileInputRef}
                                onChange={(event) => handleFileUpload(event, server.ip)}
                                style={{ display: 'none' }}
                              />
                              <button
                                onClick={handleUploadClick}
                                disabled={!activeServer || activeServer !== server.ip}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                              >
                                <Upload size={16} /> Upload
                              </button>
                              <button
                                onClick={() => fetchContents(server.ip, currentPaths[server.ip])}
                                disabled={!activeServer || activeServer !== server.ip}
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '5px', 
                                  padding: '6px 12px',
                                  backgroundColor: '#4CAF50',
                                  color: 'white'
                                }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                                </svg>
                                Refresh
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {loading && activeServer === server.ip && <p>Loading...</p>}
                      {fileContents[`${server.ip}:${currentPaths[server.ip]}`]?.map(item => {
                        // Handle loading state
                        if (item.type === 'loading') {
                          return (
                            <div key="loading" style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                width="16" 
                                height="16" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                                style={{ 
                                  animation: 'spin 1s linear infinite',
                                }}
                              >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                              <span>Loading directory contents...</span>
                            </div>
                          );
                        }
                        
                        // Handle error state
                        if (item.type === 'error') {
                          return (
                            <div key="error" style={{ padding: '10px 0', color: '#dc3545', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                              </svg>
                              <span>{item.name}</span>
                            </div>
                          );
                        }
                        
                        const isSelected = 
                          (item.type === 'directory' && selectedFolder?.serverIp === server.ip && selectedFolder?.path === item.path) ||
                          (item.type !== 'directory' && selectedFile?.serverIp === server.ip && selectedFile?.path === item.path);
                          
                          // Check if item is in the multi-select list
                          const isMultiSelected = selectedItems.some(
                            selectedItem => selectedItem.serverIp === server.ip && selectedItem.path === item.path
                          );

                          return (
                            <div 
                              key={item.path} 
                              onClick={(event) => item.type === 'directory' ? handleFolderClick(server.ip, item.path, event) : handleFileClick(server.ip, item.path, event)}
                              onDoubleClick={() => item.type === 'directory' ? handleFolderDoubleClick(server.ip, item.path) : null}
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '5px 0',
                                fontWeight: (isSelected || isMultiSelected) ? 'bold' : 'normal',
                                backgroundColor: isMultiSelected ? '#e3f2fd' : isSelected ? '#e2e8f0' : 'transparent',
                                borderRadius: '4px',
                                paddingLeft: '5px',
                                border: isMultiSelected ? '1px solid #2196F3' : 'none'
                              }}
                            >
                              {isMultiSelected && (
                                <div style={{ 
                                  backgroundColor: '#2196F3', 
                                  borderRadius: '50%', 
                                  width: '16px', 
                                  height: '16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginRight: '4px'
                                }}>
                                  <Check size={12} color="white" />
                                </div>
                              )}
                              {item.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                              {item.name}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}

              <div style={{ marginTop: '20px' }}>
                {servers
                  .filter(server => server.name !== 'clab-ire-3')
                  .map(server => (
                    <div key={server.ip} className="server-section">
                      <div 
                        className="server-header" 
                        onClick={() => setServerActive(server.ip)}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                      </div>
                       
                      {/* Always show server contents without conditional rendering */}
                      <div className="server-contents" style={{ marginLeft: '20px' }}>
                        <div className="path-navigation" style={{ display: 'flex', alignItems: 'center', margin: '10px 0', gap: '10px' }}>
                          <button 
                            onClick={() => navigateUp(server.ip)}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '5px',
                              padding: '4px 8px',
                              border: '1px solid #3b82f6',
                              borderRadius: '4px',
                              background: '#3b82f6',
                              color: 'white',
                              fontWeight: '500',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = '#2563eb';
                              e.currentTarget.style.borderColor = '#2563eb';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#3b82f6';
                              e.currentTarget.style.borderColor = '#3b82f6';
                            }}
                          >
                            <ArrowUp size={16} /> Up
                          </button>
                          <div 
                            style={{ 
                              overflowX: 'auto', 
                              whiteSpace: 'nowrap', 
                              padding: '5px', 
                              border: mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip] 
                                ? '2px solid #10b981' 
                                : '1px solid #eee', 
                              borderRadius: '4px', 
                              flexGrow: 1,
                              backgroundColor: mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip]
                                ? '#d1fae5'
                                : 'transparent'
                            }}
                          >
                            {currentPaths[server.ip]}
                            {mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip] && (
                              <span style={{ marginLeft: '10px', color: '#047857', fontWeight: 'bold' }}>
                                (Selected for saving)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Show file management options for import, save, select, and manage modes */}
                        {(mode === 'import' || mode === 'save' || mode === 'select' || mode === 'manage') && (
                          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            {selectedItems.length === 0 && (
                              <>
                                <button
                                  onClick={() => openCreateFolderDialog(server.ip)}
                                  disabled={!activeServer || activeServer !== server.ip}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                                >
                                  <Plus size={16} /> Folder
                                </button>
                                <button
                                  onClick={() => openCreateFileDialog(server.ip)}
                                  disabled={!activeServer || activeServer !== server.ip}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                                >
                                  <PlusCircle size={16} /> File
                                </button>
                              </>
                            )}
                            <button
                              onClick={handleCopy}
                              disabled={(!selectedItems.length > 0 && !selectedFile && !selectedFolder) || activeServer !== server.ip}
                              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                            >
                              <Copy size={16} /> Copy
                            </button>
                            {selectedItems.length === 0 && (
                              <button
                                onClick={handlePaste}
                                disabled={(!copiedItems?.length && !copiedItem) || activeServer !== server.ip}
                                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                              >
                                <Clipboard size={16} /> Paste
                              </button>
                            )}
                            <button
                              onClick={handleDeleteFile}
                              disabled={(!selectedItems.length > 0 && !selectedFile && !selectedFolder) || activeServer !== server.ip}
                              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: '#dc3545', color: 'white' }}
                            >
                              <Trash size={16} /> Delete
                            </button>
                            {selectedItems.length === 0 && (
                              <>
                                <button
                                  onClick={handleRenameClick}
                                  disabled={(!selectedFile && !selectedFolder) || activeServer !== server.ip}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                                >
                                  <Pencil size={16} /> Rename
                                </button>
                                <button
                                  onClick={handleEditClick}
                                  disabled={!selectedFile || selectedFolder || activeServer !== server.ip}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                                >
                                  <Edit size={16} /> Edit
                                </button>
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  onChange={(event) => handleFileUpload(event, server.ip)}
                                  style={{ display: 'none' }}
                                />
                                <button
                                  onClick={handleUploadClick}
                                  disabled={!activeServer || activeServer !== server.ip}
                                  style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                                >
                                  <Upload size={16} /> Upload
                                </button>
                                <button
                                  onClick={() => fetchContents(server.ip, currentPaths[server.ip])}
                                  disabled={!activeServer || activeServer !== server.ip}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '5px', 
                                    padding: '6px 12px',
                                    backgroundColor: '#4CAF50',
                                    color: 'white'
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                                  </svg>
                                  Refresh
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {loading && activeServer === server.ip && <p>Loading...</p>}
                        {fileContents[`${server.ip}:${currentPaths[server.ip]}`]?.map(item => {
                          // Handle loading state
                          if (item.type === 'loading') {
                            return (
                              <div key="loading" style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg 
                                  xmlns="http://www.w3.org/2000/svg" 
                                  width="16" 
                                  height="16" 
                                  viewBox="0 0 24 24" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  strokeWidth="2" 
                                  strokeLinecap="round" 
                                  strokeLinejoin="round"
                                  style={{ 
                                    animation: 'spin 1s linear infinite',
                                  }}
                                >
                                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <span>Loading directory contents...</span>
                              </div>
                            );
                          }
                          
                          // Handle error state
                          if (item.type === 'error') {
                            return (
                              <div key="error" style={{ padding: '10px 0', color: '#dc3545', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span>{item.name}</span>
                              </div>
                            );
                          }
                          
                          const isSelected = 
                            (item.type === 'directory' && selectedFolder?.serverIp === server.ip && selectedFolder?.path === item.path) ||
                            (item.type !== 'directory' && selectedFile?.serverIp === server.ip && selectedFile?.path === item.path);
                            
                            // Check if item is in the multi-select list
                            const isMultiSelected = selectedItems.some(
                              selectedItem => selectedItem.serverIp === server.ip && selectedItem.path === item.path
                            );

                            return (
                              <div 
                                key={item.path} 
                                onClick={(event) => item.type === 'directory' ? handleFolderClick(server.ip, item.path, event) : handleFileClick(server.ip, item.path, event)}
                                onDoubleClick={() => item.type === 'directory' ? handleFolderDoubleClick(server.ip, item.path) : null}
                                style={{
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '5px 0',
                                  fontWeight: (isSelected || isMultiSelected) ? 'bold' : 'normal',
                                  backgroundColor: isMultiSelected ? '#e3f2fd' : isSelected ? '#e2e8f0' : 'transparent',
                                  borderRadius: '4px',
                                  paddingLeft: '5px',
                                  border: isMultiSelected ? '1px solid #2196F3' : 'none'
                                }}
                              >
                                {isMultiSelected && (
                                  <div style={{ 
                                    backgroundColor: '#2196F3', 
                                    borderRadius: '50%', 
                                    width: '16px', 
                                    height: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginRight: '4px'
                                  }}>
                                    <Check size={12} color="white" />
                                  </div>
                                )}
                                {item.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                                {item.name}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            servers.map(server => (
              <div key={server.ip} className="server-section">
                <div 
                  className="server-header" 
                  onClick={() => setServerActive(server.ip)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {/* Remove the chevron icons */}
                  <span>{server.name} ({server.ip})</span>
                </div>
                 
                {/* Always show server contents without conditional rendering */}
                <div className="server-contents" style={{ marginLeft: '20px' }}>
                  <div className="path-navigation" style={{ display: 'flex', alignItems: 'center', margin: '10px 0', gap: '10px' }}>
                    <button 
                      onClick={() => navigateUp(server.ip)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '5px',
                        padding: '4px 8px',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        background: '#3b82f6',
                        color: 'white',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#2563eb';
                        e.currentTarget.style.borderColor = '#2563eb';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = '#3b82f6';
                        e.currentTarget.style.borderColor = '#3b82f6';
                      }}
                    >
                      <ArrowUp size={16} /> Up
                    </button>
                    <div 
                      style={{ 
                        overflowX: 'auto', 
                        whiteSpace: 'nowrap', 
                        padding: '5px', 
                        border: mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip] 
                          ? '2px solid #10b981' 
                          : '1px solid #eee', 
                        borderRadius: '4px', 
                        flexGrow: 1,
                        backgroundColor: mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip]
                          ? '#d1fae5'
                          : 'transparent'
                      }}
                    >
                      {currentPaths[server.ip]}
                      {mode === 'save' && selectedFile?.serverIp === server.ip && selectedFile?.path === currentPaths[server.ip] && (
                        <span style={{ marginLeft: '10px', color: '#047857', fontWeight: 'bold' }}>
                          (Selected for saving)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Show file management options for import, save, select, and manage modes */}
                  {(mode === 'import' || mode === 'save' || mode === 'select' || mode === 'manage') && (
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      {selectedItems.length === 0 && (
                        <>
                          <button
                            onClick={() => openCreateFolderDialog(server.ip)}
                            disabled={!activeServer || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                          >
                            <Plus size={16} /> Folder
                          </button>
                          <button
                            onClick={() => openCreateFileDialog(server.ip)}
                            disabled={!activeServer || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                          >
                            <PlusCircle size={16} /> File
                          </button>
                        </>
                      )}
                      <button
                        onClick={handleCopy}
                        disabled={(!selectedItems.length > 0 && !selectedFile && !selectedFolder) || activeServer !== server.ip}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                      >
                        <Copy size={16} /> Copy
                      </button>
                      {selectedItems.length === 0 && (
                        <button
                          onClick={handlePaste}
                          disabled={(!copiedItems?.length && !copiedItem) || activeServer !== server.ip}
                          style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                        >
                          <Clipboard size={16} /> Paste
                        </button>
                      )}
                      <button
                        onClick={handleDeleteFile}
                        disabled={(!selectedItems.length > 0 && !selectedFile && !selectedFolder) || activeServer !== server.ip}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: '#dc3545', color: 'white' }}
                      >
                        <Trash size={16} /> Delete
                      </button>
                      {selectedItems.length === 0 && (
                        <>
                          <button
                            onClick={handleRenameClick}
                            disabled={(!selectedFile && !selectedFolder) || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                          >
                            <Pencil size={16} /> Rename
                          </button>
                          <button
                            onClick={handleEditClick}
                            disabled={!selectedFile || selectedFolder || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                          >
                            <Edit size={16} /> Edit
                          </button>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={(event) => handleFileUpload(event, server.ip)}
                            style={{ display: 'none' }}
                          />
                          <button
                            onClick={handleUploadClick}
                            disabled={!activeServer || activeServer !== server.ip}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px' }}
                          >
                            <Upload size={16} /> Upload
                          </button>
                          <button
                            onClick={() => fetchContents(server.ip, currentPaths[server.ip])}
                            disabled={!activeServer || activeServer !== server.ip}
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '5px', 
                              padding: '6px 12px',
                              backgroundColor: '#4CAF50',
                              color: 'white'
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38"/>
                            </svg>
                            Refresh
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {loading && activeServer === server.ip && <p>Loading...</p>}
                  {fileContents[`${server.ip}:${currentPaths[server.ip]}`]?.map(item => {
                    // Handle loading state
                    if (item.type === 'loading') {
                      return (
                        <div key="loading" style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                            style={{ 
                              animation: 'spin 1s linear infinite',
                            }}
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          <span>Loading directory contents...</span>
                        </div>
                      );
                    }
                    
                    // Handle error state
                    if (item.type === 'error') {
                      return (
                        <div key="error" style={{ padding: '10px 0', color: '#dc3545', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <span>{item.name}</span>
                        </div>
                      );
                    }
                    
                    const isSelected = 
                      (item.type === 'directory' && selectedFolder?.serverIp === server.ip && selectedFolder?.path === item.path) ||
                      (item.type !== 'directory' && selectedFile?.serverIp === server.ip && selectedFile?.path === item.path);
                      
                      // Check if item is in the multi-select list
                      const isMultiSelected = selectedItems.some(
                        selectedItem => selectedItem.serverIp === server.ip && selectedItem.path === item.path
                      );

                      return (
                        <div 
                          key={item.path} 
                          onClick={(event) => item.type === 'directory' ? handleFolderClick(server.ip, item.path, event) : handleFileClick(server.ip, item.path, event)}
                          onDoubleClick={() => item.type === 'directory' ? handleFolderDoubleClick(server.ip, item.path) : null}
                          style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '5px 0',
                            fontWeight: (isSelected || isMultiSelected) ? 'bold' : 'normal',
                            backgroundColor: isMultiSelected ? '#e3f2fd' : isSelected ? '#e2e8f0' : 'transparent',
                            borderRadius: '4px',
                            paddingLeft: '5px',
                            border: isMultiSelected ? '1px solid #2196F3' : 'none'
                          }}
                        >
                          {isMultiSelected && (
                            <div style={{ 
                              backgroundColor: '#2196F3', 
                              borderRadius: '50%', 
                              width: '16px', 
                              height: '16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: '4px'
                            }}>
                              <Check size={12} color="white" />
                            </div>
                          )}
                          {item.type === 'directory' ? <Folder size={16} /> : <File size={16} />}
                          {item.name}
                        </div>
                      );
                    })}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Cancel</button>
          {mode === 'import' && selectedFile && (
            <div style={{
              marginRight: 'auto',
              padding: '8px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: '4px',
              backgroundColor: '#f3f4f6',
              fontSize: '14px'
            }}>
              Selected file: <span style={{ fontWeight: 'bold' }}>{selectedFile.path}</span>
            </div>
          )}
          {mode === 'save' && selectedFile && (
            <div style={{ 
              marginRight: 'auto', 
              padding: '8px 12px', 
              border: '1px solid #e5e7eb', 
              borderRadius: '4px',
              backgroundColor: '#f3f4f6',
              fontSize: '14px'
            }}>
              Saving to directory: <span style={{ fontWeight: 'bold' }}>{selectedFile.path}</span>
            </div>
          )}
          {mode === 'select' && selectedFile && (
            <div style={{ 
              marginRight: 'auto', 
              padding: '8px 12px', 
              border: '1px solid #e5e7eb', 
              borderRadius: '4px',
              backgroundColor: '#f3f4f6',
              fontSize: '14px'
            }}>
              Selected file: <span style={{ fontWeight: 'bold' }}>{selectedFile.path}</span>
            </div>
          )}
          {(mode === 'import' || mode === 'save' || mode === 'select') && (
            <button 
              onClick={handleImport}
              disabled={
                loading || 
                selectedItems.length > 0 || 
                (mode === 'import' && (!selectedFile || selectedFolder)) || 
                (mode === 'save' && (!selectedFile?.path || selectedFolder)) ||
                (mode === 'select' && (!selectedFile || selectedFolder))
              }
              className="import-button"
            >
              {loading ? 'Loading...' : 
               mode === 'import' ? 'Import' : 
               mode === 'save' ? 'Save to This Directory' : 
               'Select'}
            </button>
          )}
        </div>
      </div>

      {showCreateDialog && (
        <div className="centered-modal-overlay">
          <div className="centered-modal-box" style={{ width: '80%', maxWidth: '900px', maxHeight: '80vh' }}>
            <div className="modal-header">
              <h2>{createDialogType === 'folder' ? 'Create New Folder' : 'Create New File'}</h2>
              <button className="close-button" onClick={() => setShowCreateDialog(false)}>&times;</button>
            </div>
            <div className="modal-content" style={{ width: '80%', maxWidth: '900px', maxHeight: '80vh' }}>
              {createDialogType === 'folder' ? (
                <div>
                  <label htmlFor="folderName" style={{ display: 'block', marginBottom: '5px' }}>Folder Name:</label>
                  <input
                    type="text"
                    id="folderName"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    placeholder="Enter folder name"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="fileName" style={{ display: 'block', marginBottom: '5px' }}>File Name:</label>
                  <input
                    type="text"
                    id="fileName"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    placeholder="Enter file name (e.g., topology.yaml)"
                  />
                  <label htmlFor="fileContent" style={{ display: 'block', marginBottom: '5px', marginTop: '10px' }}>File Content (optional):</label>
                  <textarea
                    id="fileContent"
                    value={newFileContent}
                    onChange={(e) => setNewFileContent(e.target.value)}
                    rows="10"
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical' }}
                    placeholder="Enter file content"
                  ></textarea>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={createDialogType === 'folder' ? handleCreateFolder : handleCreateFile}
                style={{ padding: '8px 15px', backgroundColor: '#072452', color: 'white', borderRadius: '5px', border: 'none' }}
              >
                Create
              </button>
              <button onClick={() => setShowCreateDialog(false)} style={{ padding: '8px 15px', backgroundColor: '#6c757d', color: 'white', borderRadius: '5px', border: 'none' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenameDialog && itemToRename && (
        <div className="centered-modal-overlay">
          <div className="centered-modal-box">
            <div className="modal-header">
              <h2>Rename {itemToRename.isDirectory ? 'Folder' : 'File'}</h2>
              <button className="close-button" onClick={() => setShowRenameDialog(false)}>&times;</button>
            </div>
            <div className="modal-content" style={{ width: '80%', maxWidth: '900px', maxHeight: '80vh' }}>
              <label htmlFor="newName" style={{ display: 'block', marginBottom: '5px' }}>New Name:</label>
              <input
                type="text"
                id="newName"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameConfirm();
                  }
                }}
                style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                placeholder="Enter new name"
              />
            </div>
            <div className="modal-footer">
              <button
                onClick={handleRenameConfirm}
                style={{ padding: '8px 15px', backgroundColor: '#072452', color: 'white', borderRadius: '5px', border: 'none' }}
              >
                Rename
              </button>
              <button onClick={() => setShowRenameDialog(false)} style={{ padding: '8px 15px', backgroundColor: '#6c757d', color: 'white', borderRadius: '5px', border: 'none' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && fileToEdit && (
        <div className="centered-modal-overlay">
          <div className="centered-modal-box" style={{ width: '80%', maxWidth: '1000px', height: '80%', maxHeight: '800px' }}>
            <div className="modal-header">
              <h2>Edit File: {fileToEdit.path}</h2>
              <button className="close-button" onClick={() => setShowEditDialog(false)}>&times;</button>
            </div>
            <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 120px)' }}>
              {isSaveAs && (
                <div style={{ marginBottom: '10px' }}>
                  <label htmlFor="newFileName" style={{ display: 'block', marginBottom: '5px' }}>New File Name:</label>
                  <input
                    type="text"
                    id="newFileName"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '4px' }}
                    placeholder="Enter new file name"
                  />
                </div>
              )}
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                style={{ 
                  width: '250%', 
                  height: '100%', 
                  padding: '10px', 
                  border: '1px solid #ccc', 
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '14px',
                  resize: 'none'
                }}
              />
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <button
                  onClick={toggleSaveAs}
                  style={{ 
                    padding: '8px 15px', 
                    backgroundColor: isSaveAs ? '#28a745' : '#6c757d', 
                    color: 'white', 
                    borderRadius: '5px', 
                    border: 'none',
                    marginRight: '10px'
                  }}
                >
                  {isSaveAs ? 'Cancel Save As' : 'Save As...'}
                </button>
              </div>
              <div>
                <button
                  onClick={() => handleSaveFile(isSaveAs)}
                  style={{ 
                    padding: '8px 15px', 
                    backgroundColor: '#072452', 
                    color: 'white', 
                    borderRadius: '5px', 
                    border: 'none',
                    marginRight: '10px'
                  }}
                >
                  {isSaveAs ? 'Save As' : 'Save'}
                </button>
                <button 
                  onClick={() => setShowEditDialog(false)} 
                  style={{ 
                    padding: '8px 15px', 
                    backgroundColor: '#6c757d', 
                    color: 'white', 
                    borderRadius: '5px', 
                    border: 'none' 
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManagerModal;