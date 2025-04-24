import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_URL } from '../../config';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import { useAuth } from '../../contexts/AuthContext';
import ErrorBoundary from './ErrorBoundary';


function ChatLayout() {
  const [chats, setChats] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const { currentUser, token, logout } = useAuth();
  const navigate = useNavigate();

  // In ChatLayout.jsx, add this to your socket effect
  useEffect(() => {
    if (!socket) return;
    
    socket.on('user_added', (newUser) => {
      setUsers(prevUsers => [...prevUsers, newUser]);
    });
    
    socket.on('chat_created', (newChat) => {
      setChats(prevChats => [...prevChats, newChat]);
    });
    
    socket.on('chat_updated', (updatedChat) => {
      setChats(prevChats => 
        prevChats.map(chat => 
          chat._id === updatedChat._id ? updatedChat : chat
        )
      );
    });
    
    socket.on('chat_removed', (data) => {
      setChats(prevChats => 
        prevChats.filter(chat => chat._id !== data.chat_id)
      );
      if (window.location.pathname.includes(data.chat_id)) {
        navigate('/chat');
      }
    });
    

    return () => {
      socket.off('user_added');
      socket.off('chat_created');
      socket.off('chat_updated');
      socket.off('chat_removed');
    };
  }, [socket, navigate]);
  
  // Initialize socket connection
  useEffect(() => {
    if (!token) return;
    
    const newSocket = io(API_URL, {
      auth: {
        token
      }
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  // Load chats and users
  useEffect(() => {
    async function fetchData() {
      try {
        const [chatsResponse, usersResponse] = await Promise.all([
          axios.get(`${API_URL}/api/chats`),
          axios.get(`${API_URL}/api/users`)
        ]);
        
        setChats(chatsResponse.data.chats);
        setUsers(usersResponse.data.users);
        console.log('Users fetched in ChatLayout:', usersResponse.data.users);
      } catch (error) {
        console.error('Error fetching data:', error.response?.data || error.message);
        if (error.response?.status === 401) {
          logout();
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [logout, navigate]);

  // Create a new chat
  const createChat = async (userId) => {
    try {
      const response = await axios.post(`${API_URL}/api/chats`, {
        user_id: userId
      });
      
      // Check if this is a new chat or existing one
      const chatExists = chats.some(chat => chat._id === response.data._id);
      
      if (!chatExists) {
        setChats(prevChats => [...prevChats, response.data]);
      }
      
      navigate(`/chat/${response.data._id}`);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  };

  // Create a new group chat
  const createGroupChat = async (name, participants) => {
    try {
      const response = await axios.post(`${API_URL}/api/chats`, {
        name,
        participants
      });
      
      setChats(prevChats => [...prevChats, response.data]);
      navigate(`/chat/${response.data._id}`);
    } catch (error) {
      console.error('Error creating group chat:', error);
    }
  };

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  return (
    <div className="chat-layout">
      <Sidebar 
        chats={chats} 
        users={users} 
        createChat={createChat}
        createGroupChat={createGroupChat}
        currentUser={currentUser}
      />
      
      <Routes>
        <Route 
          path="/" 
          element={
            <div className="welcome-screen">
              <h2>Welcome to ChatApp</h2>
              <p>Select a chat or start a new conversation</p>
            </div>
          } 
        />
        <Route 
          path="/:chatId" 
          element={
            <ErrorBoundary>
              <ChatWindow 
                chats={chats}
                setChats={setChats}
                currentUser={currentUser}
                socket={socket}
                users={users}
              />
            </ErrorBoundary>
          } 
        />
      </Routes>
    </div>
  );
}

export default ChatLayout;