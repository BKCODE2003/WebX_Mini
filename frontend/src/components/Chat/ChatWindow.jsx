import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../../config';
import MessageInput from './MessageInput';
import Message from './Message';

function ChatWindow({ chats, setChats, currentUser, socket }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { chatId } = useParams();
  const messagesEndRef = useRef(null);
  
  const currentChat = chats.find(chat => chat._id === chatId);

  // Get chat name for display
  const getChatName = () => {
    if (!currentChat) return 'Loading...';
    
    if (currentChat.name) return currentChat.name;
    
    const otherParticipant = currentChat.participant_details?.find(
      p => p._id !== currentUser._id
    );
    
    return otherParticipant?.username || 'Unknown User';
  };

  // Load messages
  useEffect(() => {
    async function fetchMessages() {
      setLoading(true);
      setError('');
      
      try {
        const response = await axios.get(`${API_URL}/api/chats/${chatId}/messages`);
        setMessages(response.data.messages || []);
      } catch (error) {
        console.error('Error fetching messages:', error);
        setError('Failed to load messages');
      } finally {
        setLoading(false);
      }
    }
    
    if (chatId) {
      fetchMessages();
    }
  }, [chatId]);

  // Socket events
  useEffect(() => {
    if (!socket || !chatId) return;
    
    // Join chat room
    socket.emit('join', { chat_id: chatId });
    
    // Listen for new messages
    socket.on('new_message', (message) => {
      if (message.chat_id === chatId) {
        setMessages(prev => [...prev, message]);
        
        // Update chat's last message
        setChats(prevChats => 
          prevChats.map(chat => 
            chat._id === chatId 
              ? { ...chat, last_message: message } 
              : chat
          )
        );
      }
    });
    
    // Listen for message updates
    socket.on('message_updated', (message) => {
      if (message.chat_id === chatId) {
        setMessages(prev => 
          prev.map(msg => 
            msg._id === message._id ? message : msg
          )
        );
      }
    });
    
    // Listen for message deletions
    socket.on('message_deleted', (data) => {
      if (data.chat_id === chatId) {
        setMessages(prev => 
          prev.filter(msg => msg._id !== data.message_id)
        );
      }
    });
    
    return () => {
      socket.emit('leave', { chat_id: chatId });
      socket.off('new_message');
      socket.off('message_updated');
      socket.off('message_deleted');
    };
  }, [socket, chatId, setChats]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = async (content) => {
    try {
      await axios.post(`${API_URL}/api/chats/${chatId}/messages`, { content });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };
  
  // Edit message
  const editMessage = async (messageId, content) => {
    try {
      await axios.put(`${API_URL}/api/messages/${messageId}`, { content });
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };
  
  // Delete message
  const deleteMessage = async (messageId) => {
    try {
      await axios.delete(`${API_URL}/api/messages/${messageId}`);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  if (!currentChat) {
    return (
      <div className="chat-window">
        <div className="loading">Chat not found</div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>{getChatName()}</h3>
      </div>
      
      <div className="messages-container">
        {loading ? (
          <div className="loading">Loading messages...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : messages.length === 0 ? (
          <div className="no-messages">No messages yet. Say hello!</div>
        ) : (
          <div className="messages">
            {messages.map((message) => (
              <Message
                key={message._id}
                message={message}
                isOwn={message.sender_id === currentUser._id}
                onEdit={editMessage}
                onDelete={deleteMessage}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      <MessageInput onSend={sendMessage} />
    </div>
  );
}

export default ChatWindow;