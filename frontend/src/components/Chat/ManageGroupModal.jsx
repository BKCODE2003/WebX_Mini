import { useState } from 'react';
import axios from 'axios';
import { API_URL } from '../../config';

function ManageGroupModal({ chat, users, onClose, currentUser }) {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  console.log('ManageGroupModal props:', { chat, users, currentUser }); // Debug

  // Filter users not already in the group
  const availableUsers = (users || []).filter(
    user => !(chat?.participants || []).includes(user._id) && user._id !== currentUser?._id
  );

  const filteredUsers = availableUsers.filter(user =>
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddUsers = async () => {
    try {
      for (const userId of selectedUsers) {
        await axios.post(`${API_URL}/api/chats/${chat._id}/participants`, { user_id: userId });
        console.log(`Added user ${userId}`);
      }
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error adding users:', error.response?.data || error.message);
    }
  };

  const handleRemoveUser = async (userId) => {
    if (window.confirm('Are you sure you want to remove this user from the group?')) {
      try {
        await axios.delete(`${API_URL}/api/chats/${chat._id}/participants/${userId}`);
        console.log(`Removed user ${userId}`);
      } catch (error) {
        console.error('Error removing user:', error.response?.data || error.message);
      }
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  if (!chat || !currentUser) {
    return <div>Error: Missing chat or user data</div>;
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <h2>Manage Group: {chat.name}</h2>
        
        <div className="user-list">
          <h4>Add Users</h4>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {filteredUsers.length === 0 ? (
            <p>No users available to add</p>
          ) : (
            filteredUsers.map(user => (
              <div key={user._id} className="user-item">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user._id)}
                  onChange={() => handleUserSelect(user._id)}
                />
                <span>{user.username}</span>
              </div>
            ))
          )}
          <button
            onClick={handleAddUsers}
            disabled={selectedUsers.length === 0}
          >
            Add Selected Users
          </button>
        </div>
        
        <div className="user-list">
          <h4>Current Members</h4>
          {(chat.participant_details || []).length === 0 ? (
            <p>No members in group</p>
          ) : (
            (chat.participant_details || []).map(participant => (
              <div key={participant._id} className="user-item">
                <span>{participant.username}</span>
                {participant._id !== currentUser._id && (
                  <button
                    className="remove-btn"
                    onClick={() => handleRemoveUser(participant._id)}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))
          )}
        </div>
        
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default ManageGroupModal;