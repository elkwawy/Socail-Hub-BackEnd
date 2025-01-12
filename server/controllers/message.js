// controllers/message.js
import Message from '../models/Message.js';
import { createError } from "../error.js";
import { createNotificationForUser } from './notification.js';
import Community from '../models/Community.js';
import User from '../models/User.js';
import { addHistory } from '../controllers/historyController.js';
import path from 'path';
import upload from '../upload.js';

// Function to get the full name of a user by their ID
export const getUserFullName = async (userId) => {
  try {
    const user = await User.findById(userId);
    return user ? user.name : '';
  } catch (error) {
    console.error('Error getting user full name:', error);
    return '';
  }
};

// Helper function to check if a user is blocked
const isUserBlocked = async (senderId, receiverId) => {
  try {
    const sender = await User.findById(senderId);
    return sender ? sender.blockedUsers.includes(receiverId) : false;
  } catch (error) {
    console.error('Error checking if user is blocked:', error);
    return false;
  }
};



export const sendMessage = (io) => async (req, res, next) => {
  upload.single('media')(req, res, async (err) => {
    if (err) {
      console.error(err); // Log the error for debugging
      return next(createError(500, 'File upload failed'));
    }

    try {
      const senderId = req.user.id; // Authenticated user ID
      const { receiverId, content } = req.body;
      let photoUrl = null;
      let videoUrl = null;

      // Retrieve sender details
      const sender = await User.findById(senderId).select('name');
      if (!sender) {
        return res.status(404).json({ success: false, message: 'Sender not found' });
      }

      const senderName = sender.name;

      // Check if the receiver exists
      const receiver = await User.findById(receiverId);
      if (!receiver) {
        return res.status(404).json({ success: false, message: 'Receiver not found' });
      }

      const receiverName = receiver.name;

      // Check if the receiver is blocked
      const isReceiverBlocked = await isUserBlocked(senderId, receiverId);
      if (isReceiverBlocked) {
        return res.status(403).json({ success: false, message: 'Cannot send messages to blocked users' });
      }

      // Handle file uploads
      if (req.file) {
        const fileExtension = path.extname(req.file.filename).toLowerCase();
        if (fileExtension === '.jpg' || fileExtension === '.jpeg' || fileExtension === '.png') {
          photoUrl = req.file.path;
        } else if (fileExtension === '.mp4' || fileExtension === '.mov') {
          videoUrl = req.file.path;
        }
      }

      // Save the message
      const message = new Message({
        senderId,
        receiverId,
        content,
        photoUrl,
        videoUrl,
        type: 'chat',
        status: 'sent', // Add a status field for tracking
      });
      await message.save();

      // Emit the message to the sender and receiver
      io.to(senderId).emit('privateMessage', {
        senderId,
        receiverId,
        content,
        photoUrl,
        videoUrl,
        type: 'chat',
        createdAt: message.createdAt,
      });
      
      io.to(receiverId).emit('privateMessage', {
        senderId,
        receiverId,
        content,
        photoUrl,
        videoUrl,
        type: 'chat',
        createdAt: message.createdAt,
      });

      // Update the receiver's message inbox
      await User.findByIdAndUpdate(receiverId, {
        $push: { inbox: message._id },
      });

      // Add history for the direct message
      await addHistory(senderId, `Sent a message to user ${receiverName}`);

      // Create notification with sender's name
      const notificationMessage = `${senderName} sent you a message: "${content}"`;
      await createNotificationForUser(senderId, receiverId, notificationMessage);

      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  });
};



export const getConversation = async (req, res, next) => {
  try {
    const senderId = req.user.id; // Assuming req.user.id is the sender's ID from JWT
    const receiverId = req.query.receiverId;

    const messages = await Message.find({
      $or: [
        { senderId, receiverId },
        { senderId: receiverId, receiverId: senderId }
      ]
    }).sort({ timestamp: 1 });

      // Fetch receiver details (name and profile picture)
      const receiver = await User.findById(receiverId).select('name profilePicture');

      // Process messages to include receiver details
      const processedMessages = messages.map((message) => ({
          ...message._doc,
          receiverName: receiver?.name || "Unknown Receiver",
          receiverProfilePicture: receiver?.profilePicture || null,
      }));

      res.json(processedMessages);
  } catch (error) {
      next(error);
  }
};


export const markMessageAsRead = async (req, res, next) => {
  try {
    const messageId = req.params.messageId; // Assuming messageId is passed in the request params
    const message = await Message.findById(messageId);
    
    if (!message) {
      return next(createError(404, "Message not found"));
    }

    message.isRead = true;
    await message.save();
    await addHistory(message.senderId, `isRead_message`);

    res.status(200).json({ success: true, message: "Message marked as read" });
  } catch (error) {
    next(error);
  }
};



export const getGroupConversations = async (req, res, next) => {
  try {
      const { groupId } = req.body; // Assuming groupId is passed in the JSON body

      if (!groupId) {
          return res.status(400).json({ message: 'groupId is required in the request body' });
      }

      // Fetch all community messages for the specified group
      const messages = await Message.find({ groupId, type: 'community' }).sort({ timestamp: 1 });

      // Fetch sender details (name and profile picture) for each message
      const processedMessages = await Promise.all(
          messages.map(async (message) => {
              const sender = await User.findById(message.senderId).select('name profilePicture');
              return {
                  ...message._doc,
                  senderName: sender?.name || "Unknown Sender",
                  senderProfilePicture: sender?.profilePicture || null,
              };
          })
      );

      res.json(processedMessages);
  } catch (error) {
      next(error);
  }
};



// Function to get community members based on communityId
const getCommunityMembers = async (communityId) => {
  const community = await Community.findById(communityId);
  return community ? community.members : [];
};





















export const sendCommunityMessage = (io) => async (req, res, next) => {
  upload.single('media')(req, res, async (err) => {
    if (err) {
      return next(createError(500, 'File upload failed'));
    }

    try {
      const { communityId, content } = req.body;
      const senderId = req.user.id;
      let photoUrl = null;
      let videoUrl = null;

      if (!communityId || !content || !senderId) {
        return res.status(400).json({ success: false, message: 'CommunityId, content, and senderId are required' });
      }

      if (req.file) {
        const fileExtension = path.extname(req.file.filename).toLowerCase();
        if (fileExtension === '.jpg' || fileExtension === '.jpeg' || fileExtension === '.png') {
          photoUrl = req.file.path;
        } else if (fileExtension === '.mp4' || fileExtension === '.mov') {
          videoUrl = req.file.path;
        }
      }

      // Verify the community exists
      const community = await Community.findById(communityId);

      if (!community) {
        return res.status(404).json({
          success: false,
          message: 'Community not found',
        });
      }

      // Save the community message with receiverId as communityId
      const message = new Message({
        senderId,
        receiverId: communityId, // Set receiverId to communityId
        content,
        photoUrl,
        videoUrl,
        type: 'community',
      });
      await message.save();

      // Emit the message to all connected clients
      io.to(communityId).emit('communityMessage', {
        senderId,
        communityId,
        content,
        photoUrl,
        videoUrl,
        type: 'community',
        createdAt: message.createdAt,
      });

      // Add history for the community message
      await addHistory(senderId, `Sent a message to community ${community.name}`);

      // Notify all community members (example, adjust as needed)
      const notificationMessage = `${sender.name} posted in ${community.name}: "${content}"`;
      await createNotificationForUser(senderId, communityId, notificationMessage);

      res.status(201).json({
        success: true,
        message: 'Community message sent successfully',
      });
    } catch (error) {
      next(error);
    }
  });
};














export const getUsersWithChatMessages = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Find messages where the user is either the sender or receiver
    const userMessages = await Message.find({
      $or: [{ senderId: userId }, { receiverId: userId }],
    })
      .sort({ timestamp: -1 }) // Sort by latest messages first
      .exec();

    // Create a map to store the latest message with each user
    const userMap = new Map();

    userMessages.forEach((message) => {
      const senderId = message.senderId ? message.senderId.toString() : null;
      const receiverId = message.receiverId ? message.receiverId.toString() : null;

      // Ensure both senderId and receiverId exist before proceeding
      if (!senderId || !receiverId) return;

      const otherUserId =
        senderId === userId ? receiverId : senderId;

      // Only store the latest message for each user
      if (!userMap.has(otherUserId)) {
        userMap.set(otherUserId, message);
      }
    });

    // Process the map to fetch user or community details
    const processedMessages = await Promise.all(
      Array.from(userMap.entries()).map(async ([otherUserId, message]) => {
        // Try to find the otherUserId in the User model
        const user = await User.findById(otherUserId).select('name profilePicture');
        if (user) {
          return {
            ...message._doc,
            receiverName: user.name,
            receiverProfilePicture: user.profilePicture,
          };
        }

        // If not found in User model, try the Community model
        const community = await Community.findById(otherUserId).select('name');
        if (community) {
          return {
            ...message._doc,
            receiverName: community.name,
            receiverProfilePicture: null, // Communities don't have profile pictures
          };
        }

        // If otherUserId is not found in either model
        return {
          ...message._doc,
          receiverName: "Unknown Receiver",
          receiverProfilePicture: null,
        };
      })
    );

    res.status(200).json({ success: true, messages: processedMessages });
  } catch (error) {
    console.error("Error fetching user chat messages:", error);
    next(error);
  }
};
