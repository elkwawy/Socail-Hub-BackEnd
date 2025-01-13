import mongoose from 'mongoose';

const CommunitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    messages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
      },
    ],
    invitations: [
      {
        senderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        receiverId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        accepted: {
          type: Boolean,
          default: false,
        },
        senderName: {
          type: String,
        },
        senderProfilePicture: {
          type: String,
        },
        receiverName: {
          type: String,
        },
        receiverProfilePicture: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Community', CommunitySchema);
