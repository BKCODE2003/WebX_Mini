import { useState } from 'react';

function NewChatModal({ users, onClose, createChat, createGroupChat }) {
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter users based on search query
  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleUserSelect = (userId) => {
    if (isGroup) {
      // Toggle selection for group chat
      setSelectedUsers(prev => 
        prev.includes(userId)
          ? prev.filter(id => id !== userId)
          : [...prev, userId]
      );
    } else {
      // Direct chat - just create it
      createChat(userId);
      onClose();
    }
  };

  const handleCreateGroupChat = () => {
    if (groupName.trim() && selectedUsers.length > 0) {
      createGroupChat(groupName, selectedUsers);
      onClose();
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h3>{isGroup ? 'New Group Chat' : 'New Chat'}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-tabs">
          <button 
            className={!isGroup ? 'active' : ''}
            onClick={() => setIsGroup(false)}
          >
            Direct Message
          </button>
          <button 
            className={isGroup ? 'active' : ''}
            onClick={() => setIsGroup(true)}
          >
            Group Chat
          </button>
        </div>
        
        {isGroup && (
          <div className="group-name-input">
            <input
              type="text"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
        )}
        
        <div className="search-input">
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="user-list">
          {filteredUsers.length === 0 ? (
            <div className="no-users">No users found</div>
          ) : (
            filteredUsers.map((user) => (
              <div 
                key={user._id}
                className={`user-item ${
                  isGroup && selectedUsers.includes(user._id) ? 'selected' : ''
                }`}
                onClick={() => handleUserSelect(user._id)}
              >
                <div className="user-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <div className="user-name">{user.username}</div>
                {isGroup && (
                  <div className="checkbox">
                    {selectedUsers.includes(user._id) && '✓'}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        
        {isGroup && (
          <div className="modal-footer">
            <button 
              className="create-group-btn"
              disabled={!groupName.trim() || selectedUsers.length === 0}
              onClick={handleCreateGroupChat}
            >
              Create Group Chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default NewChatModal;