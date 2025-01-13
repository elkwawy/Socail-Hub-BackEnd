import Community from '../models/Community.js';
import User from '../models/User.js';
import { createNotificationForUser, sendNotificationsToCommunityMembers,createNotificationForOwner } from './notification.js';
import Notification from '../models/Notification.js';
import { addHistory } from '../controllers/historyController.js'; // Import the function to add history entries
import io from '../socket.js'; // Adjust the path to your actual Socket.io instance

import mongoose from 'mongoose';


// Function to create a community
export const createCommunity = async (req, res) => {
    try {
      const { name } = req.body;
  
      // Check if the community already exists
      const existingCommunity = await Community.findOne({ name });
      if (existingCommunity) {
        return res.status(400).json({ message: 'Community with this name already exists' });
      }
  
      // Create the community
      const community = await Community.create({ name });
  
      // Make the user who created the community an admin
      const user = await User.findById(req.user.id);
      user.isAdmin = true;
      user.community = community.id;
      user.communities.push(community.id); // Add the community to user's communities
      await user.save();
  
      // Add the user to the community admins and members
      community.admins.push(req.user.id);
      community.members.push(req.user.id);
      await community.save();

    await addHistory(req.user.id, `Created Community: ${name}`);
      res.status(201).json({ community, message: 'Community created successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
    }
  };
  
// Function to send an invitation to a user
export const sendInvitation = async (req, res) => {
  try {
    const { communityId, userId } = req.body;

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    // Check if the sender is an admin of the community
    if (!community.admins.includes(req.user.id)) {
      return res.status(403).json({ message: 'Only admins can send invitations' });
    }

    // Check if the user is already a member of the community
    if (community.members.includes(userId)) {
      return res.status(400).json({ message: 'User is already a member of the community' });
    }

    // Check if the receiver is blocked by the sender
    const senderId = req.user.id;
    const receiverId = userId; // Assuming userId is the receiver's ID
    const isReceiverBlocked = await isUserBlocked(senderId, receiverId);

    if (isReceiverBlocked) {
      return res.status(403).json({ success: false, message: 'Cannot send invitation to blocked users' });
    }

    // Check if the user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if an invitation has already been sent to the user
    if (user.invitations.some(invitation => invitation.communityId && invitation.communityId.equals(communityId))) {
      return res.status(400).json({ message: 'Invitation already sent to this user' });
    }

    // Send the invitation
    user.invitations.push({ communityId, senderId: req.user.id, accepted: false }); // Include communityId in the invitation
    await user.save();

    // Create a notification for the user
    const invitationMessage = `${req.user.name} invited you to join the community "${community.name}"`;
    await createNotificationForUser(req.user.id, userId, invitationMessage);
    await addHistory(req.user.id, `Send Invitation for Community: "${community.name}"  To :"${user.name}"`);

    res.status(200).json({ message: 'Invitation sent successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};


  







export const acceptInvitation = async (req, res) => {
  try {
    const { communityId } = req.body;

    // Check if the user has received an invitation
    const user = await User.findById(req.user.id);

    // Ensure that user and user.invitations are defined
    if (!user || !user.invitations || !Array.isArray(user.invitations)) {
      return res.status(400).json({ message: 'Invalid user or invitations array' });
    }

    // Convert communityId to a string for accurate comparison
    const stringCommunityId = communityId.toString();

    // Find the invitation in the user's invitations array
    const invitationIndex = user.invitations.findIndex(invitation => {
      return invitation.communityId && invitation.communityId.toString() === stringCommunityId;
    });

    // If the invitation doesn't exist, return an error
    if (invitationIndex === -1) {
      return res.status(400).json({ message: 'No invitation received for this community' });
    }

    // Add the user to the community members
    const community = await Community.findById(communityId);
    community.members.push(req.user.id);

    // Add the community to the user's communities list
    user.communities.push(communityId);

    await community.save();

    // Remove the invitation from the user's list
    user.invitations.splice(invitationIndex, 1);
    await user.save();

    // Notify the admin that the user accepted the invitation
    const adminNotificationMessage = `${user.name} accepted the invitation to join the community "${community.name}"`;
    await createNotificationForOwner(req.user.id, community.admins, adminNotificationMessage);

    // Send notifications to all community members about the new member
    await sendNotificationsToCommunityMembers(community.id, req.user.id);
    await addHistory(req.user.id, `accepted Invitation for Community: "${community.name}"`);

    // Make the user join the community room
    const userSocketId = global.onlineUsers.get(req.user.id);
    if (userSocketId) {
      io.sockets.sockets.get(userSocketId).join(communityId);
      console.log(`User with socket ID ${userSocketId} joined community room ${communityId}`);
    }

    res.status(200).json({ message: 'Invitation accepted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
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





// Function to delete a community permanently and restrict to admin only
export const deleteCommunityFromMyCommunities = async (req, res) => {
  try {
      const { communityId } = req.params; // Extract communityId from request parameters

      // Find the community
      const community = await Community.findById(communityId);
      if (!community) {
          return res.status(404).json({ message: 'Community not found' });
      }

      // Check if the requesting user is an admin of the community
      if (!community.admins.includes(req.user.id)) {
          return res.status(403).json({ message: 'You are not authorized to {DELETE} this community' });
      }

      // Delete the community permanently from the database
      await Community.findByIdAndDelete(communityId);

      // Remove the community from all its members
      await User.updateMany(
          { communities: communityId },
          { $pull: { communities: communityId } }
      );

      // Add history entry
      await addHistory(req.user.id, `Permanently Deleted Community: "${community.name}"`);

      res.status(200).json({ message: 'Community deleted permanently successfully' });
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
  }
};



// Function to get a community by its ID
export const getCommunityById = async (req, res) => {
  try {
      const { communityId } = req.params; // Extract communityId from request parameters

      // Fetch the community by its ID
      const community = await Community.findById(communityId)
          .populate('admins', 'name email') // Populate admin details
          .populate('members', 'name email'); // Populate member details

      if (!community) {
          return res.status(404).json({ message: 'Community not found' });
      }

      res.status(200).json({ community });
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server Error' });
  }
};


export const exitCommunity = async (req, res) => {
  try {
    const { communityId } = req.params; // Extract communityId from request parameters

    // Find the community
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    // Check if the user is a member of the community
    if (!community.members.includes(req.user.id)) {
      return res.status(400).json({ message: 'You are not a member of this community' });
    }

    // If the user is an admin, handle admin reassignment
    if (community.admins.includes(req.user.id)) {
      // Remove the current admin from the admin list
      community.admins = community.admins.filter(adminId => adminId.toString() !== req.user.id);

      // Assign a new admin if there are other members
      if (community.members.length > 1) {
        const newAdminId = community.members.find(memberId => memberId.toString() !== req.user.id);
        if (newAdminId) {
          community.admins.push(newAdminId);

          // Add the community to the new admin's communities list only if not already present
          const newAdmin = await User.findById(newAdminId);
          if (newAdmin && !newAdmin.communities.includes(communityId)) {
            newAdmin.communities.push(communityId);
            await newAdmin.save();
          }

          // Notify the new admin
          const notificationMessage = `You have been assigned as the new admin of the community "${community.name}".`;
          await createNotificationForUser(req.user.id, newAdminId, notificationMessage);
        }
      }
    }

    // Remove the user from the community's members list
    community.members = community.members.filter(memberId => memberId.toString() !== req.user.id);
    await community.save();

    // Remove the community from the user's communities list
    const user = await User.findById(req.user.id);
    user.communities = user.communities.filter(id => id.toString() !== communityId);
    await user.save();

    // Add history entry
    await addHistory(req.user.id, `Exited Community: "${community.name}"`);

    // Make the user leave the community room
    const userSocketId = global.onlineUsers.get(req.user.id);
    if (userSocketId) {
      io.sockets.sockets.get(userSocketId).leave(communityId);
      console.log(`User with socket ID ${userSocketId} left community room ${communityId}`);
    }

    res.status(200).json({ message: 'You have exited the community successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error' });
  }
};






export const getMyInvitations = async (req, res) => {
  try {
    // البحث عن المستخدم الحالي
    const user = await User.findById(req.user.id)
      .select('invitations') // اختر فقط الدعوات
      .populate({
        path: 'invitations.communityId',
        select: 'name', // جلب اسم المجتمع فقط
      })
      .populate({
        path: 'invitations.senderId',
        select: 'name profilePicture', // جلب اسم المرسل وصورته الشخصية
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // إعادة ترتيب البيانات لتشمل المعلومات المطلوبة فقط
    const myInvitations = user.invitations.map((invitation) => ({
      communityId: invitation.communityId?._id || null,
      communityName: invitation.communityId?.name || null,
      senderId: invitation.senderId?._id || null,
      senderName: invitation.senderId?.name || null,
      senderProfilePicture: invitation.senderId?.profilePicture || null,
      accepted: invitation.accepted,
      _id: invitation._id,
    }));

    res.status(200).json({ myInvitations });
  } catch (error) {
    console.error('Error fetching my invitations:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};



export const ignoreInvitationById = async (req, res) => {
  try {
    const { invitationId } = req.body;

    // تحقق من وجود المستخدم
    const user = await User.findById(req.user.id);

    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: 'User not found' });
    }

    console.log("Invitation ID from request:", invitationId);
    console.log("User Invitations:", user.invitations);

    // البحث عن الدعوة باستخدام invitationId
    const invitationIndex = user.invitations.findIndex((invitation) => {
      console.log(`Checking invitation ID: ${invitation._id.toString()} === ${invitationId}`);
      return invitation._id.toString() === invitationId;
    });

    if (invitationIndex === -1) {
      console.log(`No invitation found for invitationId: ${invitationId}`);
      return res.status(400).json({ message: 'No invitation found for this ID' });
    }

    // إزالة الدعوة من قائمة دعوات المستخدم
    user.invitations.splice(invitationIndex, 1);
    await user.save();

    res.status(200).json({ message: 'Invitation ignored successfully' });
  } catch (error) {
    console.error('Error ignoring invitation:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
