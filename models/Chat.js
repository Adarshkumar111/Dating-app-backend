import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String },
  messageType: { type: String, enum: ['text', 'image', 'video', 'voice'], default: 'text' },
  mediaUrl: { type: String }, // URL for image/video/voice
  mediaDuration: { type: Number }, // Duration in seconds for video/voice
  sentAt: { type: Date, default: Date.now },
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users who received the message
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Users who saw the message
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedForEveryone: { type: Boolean, default: false },
  reactions: [reactionSchema]
});

const chatSchema = new mongoose.Schema({
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Unique key for the user pair (sorted). Prevents duplicate chats per pair regardless of creation order.
  pairKey: { type: String, index: true, unique: true, sparse: true },
  // When true, this chat is a pending request (created on chat request send). Messages should be disabled until accepted.
  isPending: { type: Boolean, default: false },
  isBlocked: { type: Boolean, default: false },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  messages: [messageSchema]
}, { timestamps: true });

// Index for finding chats between two users
chatSchema.index({ users: 1 });

export default mongoose.model('Chat', chatSchema);
