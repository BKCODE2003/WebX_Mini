# backend/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from pymongo import MongoClient
from datetime import datetime
from bson.objectid import ObjectId
import bcrypt
import datetime
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = datetime.timedelta(days=1)

# Setup extensions
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*",async_mode='threading')
jwt = JWTManager(app)

# MongoDB Connection
client = MongoClient(os.environ.get('MONGODB_URI'))
db = client.chatapp_db
users_collection = db.users
chats_collection = db.chats
messages_collection = db.messages

# Helper functions
def parse_json(data):
    """Convert MongoDB ObjectId to string for JSON serialization"""
    if isinstance(data, list):
        return [parse_json(item) for item in data]
    if isinstance(data, dict):
        return {key: parse_json(value) for key, value in data.items()}
    if isinstance(data, ObjectId):
        return str(data)
    if isinstance(data, datetime.datetime):
        return data.isoformat()  # Converts datetime to a JSON-serializable string
    return data

# Authentication Routes
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username', '')
    email = data.get('email', '')
    password = data.get('password', '')
    
    # Validate input
    if not username or not email or not password:
        return jsonify({"msg": "Missing required fields"}), 400
    
    # Check if user already exists
    if users_collection.find_one({'$or': [{'username': username}, {'email': email}]}):
        return jsonify({"msg": "Username or email already exists"}), 409
    
    # Hash password
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    
    # Create user
    user_id = users_collection.insert_one({
        'username': username,
        'email': email,
        'password': hashed_password,
        'profile_picture': '',
        'created_at': datetime.datetime.utcnow(),
        'last_login': datetime.datetime.utcnow()
    }).inserted_id
    
    # Create access token
    access_token = create_access_token(identity=str(user_id))
    
    return jsonify({
        'msg': 'User created successfully',
        'user_id': str(user_id),
        'access_token': access_token
    }), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username_or_email = data.get('username', '')
    password = data.get('password', '')
    
    # Find user
    user = users_collection.find_one({
        '$or': [{'username': username_or_email}, {'email': username_or_email}]
    })
    
    if not user or not bcrypt.checkpw(password.encode('utf-8'), user['password']):
        return jsonify({"msg": "Invalid credentials"}), 401
    
    # Update last login
    users_collection.update_one(
        {'_id': user['_id']},
        {'$set': {'last_login': datetime.datetime.utcnow()}}
    )
    
    # Create access token
    access_token = create_access_token(identity=str(user['_id']))
    
    return jsonify({
        'msg': 'Login successful',
        'user_id': str(user['_id']),
        'username': user['username'],
        'access_token': access_token
    }), 200

# User Routes
@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    current_user = get_jwt_identity()
    
    # Get all users except current user
    users = list(users_collection.find(
        {'_id': {'$ne': ObjectId(current_user)}},
        {'password': 0}  # Exclude password
    ))
    
    return jsonify({'users': parse_json(users)}), 200

@app.route('/api/users/me', methods=['GET'])
@jwt_required()
def get_profile():
    current_user = get_jwt_identity()
    
    user = users_collection.find_one(
        {'_id': ObjectId(current_user)},
        {'password': 0}  # Exclude password
    )
    
    if not user:
        return jsonify({"msg": "User not found"}), 404
    
    return jsonify(parse_json(user)), 200

@app.route('/api/users/me', methods=['PUT'])
@jwt_required()
def update_profile():
    current_user = get_jwt_identity()
    data = request.get_json()
    
    # Fields that can be updated
    updatable_fields = ['username', 'profile_picture']
    update_data = {k: v for k, v in data.items() if k in updatable_fields}
    
    if 'username' in update_data:
        # Check if username is already taken
        if users_collection.find_one({'username': update_data['username'], '_id': {'$ne': ObjectId(current_user)}}):
            return jsonify({"msg": "Username already taken"}), 409
    
    # Update user
    updated = users_collection.update_one(
        {'_id': ObjectId(current_user)},
        {'$set': update_data}
    )
    
    if updated.modified_count == 0:
        return jsonify({"msg": "No changes made"}), 304
    
    # Get updated user
    user = users_collection.find_one(
        {'_id': ObjectId(current_user)},
        {'password': 0}
    )
    
    return jsonify(parse_json(user)), 200

# Chat Routes
@app.route('/api/chats', methods=['GET'])
@jwt_required()
def get_chats():
    current_user = get_jwt_identity()
    
    # Get all chats where current user is a participant
    chats = list(chats_collection.find(
        {'participants': ObjectId(current_user)}
    ))
    
    # Add last message to each chat
    for chat in chats:
        last_message = messages_collection.find_one(
            {'chat_id': chat['_id']},
            sort=[('timestamp', -1)]
        )
        chat['last_message'] = last_message if last_message else None
        
        # Get participant details (excluding current user)
        participants = []
        for participant_id in chat['participants']:
            if str(participant_id) != current_user:
                user = users_collection.find_one(
                    {'_id': participant_id},
                    {'password': 0}
                )
                if user:
                    participants.append(user)
        
        chat['participant_details'] = participants
    
    return jsonify({'chats': parse_json(chats)}), 200

@app.route('/api/chats', methods=['POST'])
@jwt_required()
def create_chat():
    current_user = get_jwt_identity()
    data = request.get_json()
    
    # Direct chat
    if 'user_id' in data:
        other_user_id = data['user_id']
        
        # Check if chat already exists
        existing_chat = chats_collection.find_one({
            'is_group': False,
            'participants': {'$all': [ObjectId(current_user), ObjectId(other_user_id)]}
        })
        
        if existing_chat:
            return jsonify(parse_json(existing_chat)), 200
        
        # Create new direct chat
        chat_id = chats_collection.insert_one({
            'name': None,
            'is_group': False,
            'participants': [ObjectId(current_user), ObjectId(other_user_id)],
            'created_at': datetime.datetime.utcnow(),
            'last_activity': datetime.datetime.utcnow()
        }).inserted_id
        
    # Group chat
    elif 'name' in data and 'participants' in data:
        participants = [ObjectId(uid) for uid in data['participants']]
        if ObjectId(current_user) not in participants:
            participants.append(ObjectId(current_user))
        
        chat_id = chats_collection.insert_one({
            'name': data['name'],
            'is_group': True,
            'participants': participants,
            'owner': ObjectId(current_user),  # Store the group owner,
            'created_at': datetime.datetime.utcnow(),
            'last_activity': datetime.datetime.utcnow()
        }).inserted_id

        # Emit chat_created event to all participants
        chat = chats_collection.find_one({'_id': chat_id})
        for participant_id in chat['participants']:
            socketio.emit('chat_created', parse_json(chat), room=str(participant_id))


    else:
        return jsonify({"msg": "Invalid request data"}), 400
    
    # Get created chat
    chat = chats_collection.find_one({'_id': chat_id})
    
    return jsonify(parse_json(chat)), 201

@app.route('/api/chats/<chat_id>', methods=['GET'])
@jwt_required()
def get_chat(chat_id):
    current_user = get_jwt_identity()
    
    # Get chat
    chat = chats_collection.find_one({
        '_id': ObjectId(chat_id),
        'participants': ObjectId(current_user)
    })
    
    if not chat:
        return jsonify({"msg": "Chat not found"}), 404
    
    # Get participant details
    participants = []
    for participant_id in chat['participants']:
        user = users_collection.find_one(
            {'_id': participant_id},
            {'password': 0}
        )
        if user:
            participants.append(user)
    
    chat['participant_details'] = participants
    
    return jsonify(parse_json(chat)), 200


@app.route('/api/chats/<chat_id>/participants', methods=['POST'])
@jwt_required()
def add_participant(chat_id):
    current_user = get_jwt_identity()
    data = request.get_json()
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({"msg": "User ID is required"}), 400
    
    chat = chats_collection.find_one({
        '_id': ObjectId(chat_id),
        'is_group': True,
        'owner': ObjectId(current_user)
    })
    
    if not chat:
        return jsonify({"msg": "Chat not found or you are not the owner"}), 403
    
    if ObjectId(user_id) in chat['participants']:
        return jsonify({"msg": "User is already in the group"}), 400
    
    updated = chats_collection.update_one(
        {'_id': ObjectId(chat_id)},
        {'$addToSet': {'participants': ObjectId(user_id)}}
    )
    
    if updated.modified_count == 0:
        return jsonify({"msg": "No changes made"}), 304
    
    # Send system message about new participant
    user = users_collection.find_one({'_id': ObjectId(user_id)})
    message_id = messages_collection.insert_one({
        'sender_id': None,  # System message
        'chat_id': ObjectId(chat_id),
        'content': f"{user['username']} was added to the group",
        'timestamp': datetime.datetime.utcnow(),
        'read': False,
        'edited': False,
        'is_system': True
    }).inserted_id
    
    updated_chat = chats_collection.find_one({'_id': ObjectId(chat_id)})
    message = messages_collection.find_one({'_id': message_id})
    
    # Emit events
    socketio.emit('new_message', parse_json(message), room=chat_id)
    socketio.emit('chat_updated', parse_json(updated_chat), room=chat_id)
    socketio.emit('chat_created', parse_json(updated_chat), room=user_id)  # Notify new user
    
    return jsonify(parse_json(updated_chat)), 200

@app.route('/api/chats/<chat_id>/participants/<user_id>', methods=['DELETE'])
@jwt_required()
def remove_participant(chat_id, user_id):
    current_user = get_jwt_identity()
    
    chat = chats_collection.find_one({
        '_id': ObjectId(chat_id),
        'is_group': True,
        'owner': ObjectId(current_user)
    })
    
    if not chat:
        return jsonify({"msg": "Chat not found or you are not the owner"}), 403
    
    if ObjectId(user_id) not in chat['participants']:
        return jsonify({"msg": "User is not in the group"}), 400
    
    if str(user_id) == current_user:
        return jsonify({"msg": "Owner cannot be removed"}), 403
    
    updated = chats_collection.update_one(
        {'_id': ObjectId(chat_id)},
        {'$pull': {'participants': ObjectId(user_id)}}
    )
    
    if updated.modified_count == 0:
        return jsonify({"msg": "No changes made"}), 304
    
    # Send system message about removed participant
    user = users_collection.find_one({'_id': ObjectId(user_id)})
    message_id = messages_collection.insert_one({
        'sender_id': None,  # System message
        'chat_id': ObjectId(chat_id),
        'content': f"{user['username']} was removed from the group",
        'timestamp': datetime.datetime.utcnow(),
        'read': False,
        'edited': False,
        'is_system': True
    }).inserted_id
    
    updated_chat = chats_collection.find_one({'_id': ObjectId(chat_id)})
    message = messages_collection.find_one({'_id': message_id})
    
    # Emit events
    socketio.emit('new_message', parse_json(message), room=chat_id)
    socketio.emit('chat_updated', parse_json(updated_chat), room=chat_id)
    socketio.emit('chat_removed', {'chat_id': chat_id}, room=user_id)  # Notify removed user
    
    return jsonify({"msg": "User removed from group"}), 200

# Message Routes
@app.route('/api/chats/<chat_id>/messages', methods=['GET'])
@jwt_required()
def get_messages(chat_id):
    current_user = get_jwt_identity()
    
    # Check if user is part of this chat
    chat = chats_collection.find_one({
        '_id': ObjectId(chat_id),
        'participants': ObjectId(current_user)
    })
    
    if not chat:
        return jsonify({"msg": "Chat not found"}), 404
    
    # Get messages for this chat
    messages = list(messages_collection.find(
        {'chat_id': ObjectId(chat_id)},
        sort=[('timestamp', 1)]
    ))
    
    return jsonify({'messages': parse_json(messages)}), 200

@app.route('/api/chats/<chat_id>/messages', methods=['POST'])
@jwt_required()
def send_message(chat_id):
    current_user = get_jwt_identity()
    data = request.get_json()
    content = data.get('content', '')
    
    if not content:
        return jsonify({"msg": "Message content is required"}), 400
    
    # Check if user is part of this chat
    chat = chats_collection.find_one({
        '_id': ObjectId(chat_id),
        'participants': ObjectId(current_user)
    })
    
    if not chat:
        return jsonify({"msg": "Chat not found"}), 404
    
    # Create message
    message_id = messages_collection.insert_one({
        'sender_id': ObjectId(current_user),
        'chat_id': ObjectId(chat_id),
        'content': content,
        'timestamp': datetime.datetime.utcnow(),
        'read': False,
        'edited': False
    }).inserted_id
    
    # Update chat last activity
    chats_collection.update_one(
        {'_id': ObjectId(chat_id)},
        {'$set': {'last_activity': datetime.datetime.utcnow()}}
    )
    
    # Get created message
    message = messages_collection.find_one({'_id': message_id})
    
    # Emit message to all participants in the chat room
    socketio.emit('new_message', parse_json(message), room=chat_id)
    
    return jsonify(parse_json(message)), 201

@app.route('/api/messages/<message_id>', methods=['PUT'])
@jwt_required()
def update_message(message_id):
    current_user = get_jwt_identity()
    data = request.get_json()
    content = data.get('content', '')
    
    if not content:
        return jsonify({"msg": "Message content is required"}), 400
    
    # Check if message exists and user is the sender
    message = messages_collection.find_one({
        '_id': ObjectId(message_id),
        'sender_id': ObjectId(current_user)
    })
    
    if not message:
        return jsonify({"msg": "Message not found or you don't have permission to edit it"}), 404
    
    # Update message
    updated = messages_collection.update_one(
        {'_id': ObjectId(message_id)},
        {
            '$set': {
                'content': content,
                'edited': True
            }
        }
    )
    
    if updated.modified_count == 0:
        return jsonify({"msg": "No changes made"}), 304
    
    # Get updated message
    message = messages_collection.find_one({'_id': ObjectId(message_id)})
    
    # Emit message update to all participants in the chat room
    socketio.emit('message_updated', parse_json(message), room=message['chat_id'])
    
    return jsonify(parse_json(message)), 200

@app.route('/api/messages/<message_id>', methods=['DELETE'])
@jwt_required()
def delete_message(message_id):
    current_user = get_jwt_identity()
    
    # Check if message exists and user is the sender
    message = messages_collection.find_one({
        '_id': ObjectId(message_id),
        'sender_id': ObjectId(current_user)
    })
    
    if not message:
        return jsonify({"msg": "Message not found or you don't have permission to delete it"}), 404
    
    # Delete message
    messages_collection.delete_one({'_id': ObjectId(message_id)})
    
    # Emit message deletion to all participants in the chat room
    socketio.emit('message_deleted', {'message_id': message_id, 'chat_id': str(message['chat_id'])}, room=str(message['chat_id']))
    
    return jsonify({"msg": "Message deleted"}), 200

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('join')
def handle_join(data):
    room = data.get('chat_id')
    if room:
        join_room(room)
        emit('status', {'msg': f'User joined room {room}'}, room=room)

@socketio.on('leave')
def handle_leave(data):
    room = data.get('chat_id')
    if room:
        leave_room(room)
        emit('status', {'msg': f'User left room {room}'}, room=room)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0')