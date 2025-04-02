import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import NewChatModal from './NewChatModal';

function Sidebar({ chats, users, createChat, createGroupChat, currentUser }) {
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const { chatId } = useParams();
  const { logout } = useAuth();

  // Sort chats by last activity
  const sortedChats = [...chats].sort((a, b) => {
    const aTime = a.last_activity || a.created_at;
    const bTime = b.last_activity || b.created_at;
    return new Date(bTime) - new Date(aTime);
  });

  // Get chat name for display
  const getChatName = (chat) => {
    if (chat.name) return chat.name;
    
    const otherParticipant = chat.participant_details?.find(
      p => p._id !== currentUser._id
    );
    
    return otherParticipant?.username || 'Unknown User';
  };

  // Get last message preview
  const getLastMessagePreview = (chat) => {
    if (!chat.last_message) return 'No messages yet';
    
    const sender = chat.last_message.sender_id === currentUser._id ? 
      'You: ' : '';
    
    return `${sender}${chat.last_message.content.substring(0, 20)}${
      chat.last_message.content.length > 20 ? '...' : ''
    }`;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>ChatApp</h2>
        <div className="sidebar-actions">
          <button 
            className="new-chat-btn"
            onClick={() => setShowNewChatModal(true)}
          >
            New Chat
          </button>
          <button 
            className="logout-btn"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
      
      <div className="chat-list">
        {sortedChats.length === 0 ? (
          <div className="no-chats">
            <p>No conversations yet</p>
            <button 
              onClick={() => setShowNewChatModal(true)}
            >
              Start a new chat
            </button>
          </div>
        ) : (
          sortedChats.map((chat) => (
            <Link
              key={chat._id}
              to={`/chat/${chat._id}`}
              className={`chat-item ${chat._id === chatId ? 'active' : ''}`}
            >
              <div className="chat-item-avatar">
                {chat.is_group ? (
                  <div className="group-avatar">G</div>
                ) : (
                  <div className="user-avatar">
                    {getChatName(chat).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="chat-item-info">
                <div className="chat-item-name">
                  {getChatName(chat)}
                </div>
                <div className="chat-item-preview">
                  {getLastMessagePreview(chat)}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
      
      {showNewChatModal && (
        <NewChatModal 
          users={users}
          onClose={() => setShowNewChatModal(false)}
          createChat={createChat}
          createGroupChat={createGroupChat}
        />
      )}
    </div>
  );
}

export default Sidebar;