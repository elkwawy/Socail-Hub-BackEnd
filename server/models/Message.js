import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community' }, // Adjusted to reference the Community model
  content: { type: String },
  photoUrl: { type: String },
  videoUrl: { type: String },
  timestamp: { type: Date, default: Date.now },
  isRead: { type: Boolean, default: false },
  type: { type: String, enum: ['chat', 'community'], required: true },
});

const Message = mongoose.model('Message', messageSchema);

export default Message;
