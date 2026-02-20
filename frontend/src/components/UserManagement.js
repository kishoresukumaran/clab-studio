import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AUTH_API_URL, BACKEND_API_URL } from '../utils/config';
import { isAdmin, getCurrentUser } from '../utils/auth';
import '../styles.css';

const api = axios.create({
  baseURL: AUTH_API_URL
});

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
    displayName: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAdmin()) {
      navigate('/');
      return;
    }
    fetchUsers();
  }, [navigate]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/users');
      setUsers(response.data);
      setError('');
    } catch (err) {
      console.error('Error fetching users:', err);
      setError(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      if (editingUser) {
        const updateData = {
          username: formData.username,
          role: formData.role,
          displayName: formData.displayName
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        await api.put(`/api/users/${editingUser._id}`, updateData);
        setSuccess('User updated successfully');
      } else {
        await api.post('/api/users', formData);

        // Also create the Linux system user on the server
        try {
          const currentUser = getCurrentUser();
          const adminUsername = currentUser?.username || 'labadmin';
          const systemUserResponse = await axios.post(`${BACKEND_API_URL}/api/system/createUser`, {
            username: formData.username,
            adminUsername: adminUsername
          });
          if (systemUserResponse.data.success) {
            setSuccess('User created successfully (UI + server)');
          } else {
            setSuccess('User created in UI, but server user creation failed: ' + systemUserResponse.data.error);
          }
        } catch (systemErr) {
          console.error('Error creating system user:', systemErr);
          setSuccess('User created in UI, but server user creation failed: ' +
            (systemErr.response?.data?.error || systemErr.message));
        }
      }
      resetForm();
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      console.error('Error saving user:', err);
      setError(err.response?.data?.message || 'Failed to save user');
    }
  };

  const handleDelete = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) return;
    setError('');
    setSuccess('');
    try {
      await api.delete(`/api/users/${userId}`);

      // Also delete the Linux system user from the server
      try {
        const currentUser = getCurrentUser();
        const adminUsername = currentUser?.username || 'labadmin';
        const systemUserResponse = await axios.post(`${BACKEND_API_URL}/api/system/deleteUser`, {
          username: username,
          adminUsername: adminUsername
        });
        if (systemUserResponse.data.success) {
          setSuccess(`User "${username}" deleted successfully (UI + server)`);
        } else {
          setSuccess(`User "${username}" deleted from UI, but server user deletion failed: ` + systemUserResponse.data.error);
        }
      } catch (systemErr) {
        console.error('Error deleting system user:', systemErr);
        setSuccess(`User "${username}" deleted from UI, but server user deletion failed: ` +
          (systemErr.response?.data?.error || systemErr.message));
      }

      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError(err.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      password: '',
      role: user.role,
      displayName: user.displayName || ''
    });
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    resetForm();
    setError('');
    setSuccess('');
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      role: 'user',
      displayName: ''
    });
    setEditingUser(null);
  };

  return (
    <div className="user-management-container">
      <div className="user-management-header">
        <button className="back-button" onClick={() => navigate('/')}>
          &larr; Back
        </button>
        <h2>User Management</h2>
        <button className="create-user-button" onClick={openCreateModal}>
          + Add User
        </button>
      </div>

      {error && !showModal && <div className="um-error">{error}</div>}
      {success && !showModal && <div className="um-success">{success}</div>}

      {loading ? (
        <div className="user-management-loading">Loading users...</div>
      ) : (
        <table className="user-management-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user._id}>
                  <td>{user.username}</td>
                  <td>{user.displayName || '-'}</td>
                  <td>
                    <span className={`role-badge role-${user.role}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <div className="user-action-buttons">
                      <button className="edit-button" onClick={() => handleEdit(user)}>
                        Edit
                      </button>
                      <button className="delete-user-button" onClick={() => handleDelete(user._id, user.username)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal">
          <div className="modal-content user-modal-content">
            <h2>{editingUser ? 'Edit User' : 'Create User'}</h2>
            {error && <div className="um-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="Enter username"
                  required
                />
              </div>
              <div className="form-group">
                <label>Password{editingUser ? ' (leave blank to keep current)' : ''}</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? 'Leave blank to keep current' : 'Enter password'}
                  required={!editingUser}
                />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  placeholder="Enter display name"
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="role-select"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="user-modal-actions">
                <button type="button" className="cancel-button" onClick={() => { setShowModal(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="submit-button">
                  {editingUser ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
