import Community from '../models/Community.js';
import User from '../models/User.js';
import Invitation from '../models/Invitation.js';
import { createNotificationForUser, sendNotificationsToCommunityMembers,createNotificationForOwner } from './notification.js';
import Notification from '../models/Notification.js';
import { addHistory } from '../controllers/historyController.js'; // Import the function to add history entries
import io from '../socket.js'; // Adjust the path to your actual Socket.io instance

import mongoose from 'mongoose';


// Function to create a community
export const createCommunity = async (req, res) => {
  try {
    const { name, description = '' } = req.body;  // إضافة الوصف بشكل اختياري

    // Check if the community already exists
    const existingCommunity = await Community.findOne({ name });
    if (existingCommunity) {
      return res.status(400).json({ message: 'Community with this name already exists' });
    }

    // Create the community
    const community = await Community.create({ name, description });

    // Ensure the user is not blocked and is eligible to create a community
    const user = await User.findById(req.user.id);
    if (!user || user.isBlocked) {
      return res.status(403).json({ message: 'You are not authorized to create a community' });
    }

    // Make the user who created the community an admin
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

    // البحث عن الكوميونيتي
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    // التحقق من أن المرسل هو المسؤول عن الكوميونيتي
    if (!community.admins.includes(req.user.id)) {
      return res.status(403).json({ message: 'Only admins can send invitations' });
    }

    // التحقق من أن المستخدم ليس عضوًا بالفعل في الكوميونيتي
    if (community.members.includes(userId)) {
      return res.status(400).json({ message: 'User is already a member of the community' });
    }

    // التحقق من أن المستخدم غير محظور
    const isReceiverBlocked = await isUserBlocked(req.user.id, userId);
    if (isReceiverBlocked) {
      return res.status(403).json({ success: false, message: 'Cannot send invitation to blocked users' });
    }

    // التحقق من وجود المستخدم
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // إنشاء الدعوة الجديدة
    const invitation = new Invitation({
      communityId,
      senderId: req.user.id,
      receiverId: userId,
      senderName: req.user.name,
      receiverName: user.name,
    });

    // تخزين الدعوة في الكوميونيتي
    community.invitations.push(invitation);

    // تخزين الدعوة في قائمة الدعوات الخاصة بالمستخدم
    user.invitations.push(invitation);

    // حفظ التحديثات في الكوميونيتي والمستخدم
    await community.save();
    await user.save();

    // إرسال الإشعار للمستقبل
    const invitationMessage = `${req.user.name} invited you to join the community "${community.name}"`;
    await createNotificationForUser(req.user.id, userId, invitationMessage);

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
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.invitations || !Array.isArray(user.invitations)) {
      return res.status(400).json({ message: 'Invalid invitations data' });
    }

    const stringCommunityId = communityId.toString();
    const invitationIndex = user.invitations.findIndex(invitation => {
      return invitation.communityId && invitation.communityId.toString() === stringCommunityId;
    });

    if (invitationIndex === -1) {
      return res.status(400).json({ message: 'No invitation found for this community' });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ message: 'Community not found' });
    }

    // Add the user to the community members and save
    community.members.push(req.user.id);
    user.communities.push(communityId);

    await community.save();
    user.invitations.splice(invitationIndex, 1);
    await user.save();

    const communityInvitationIndex = community.invitations.findIndex(invitation => {
      return invitation.senderId.toString() === user.id.toString() && invitation.communityId.toString() === communityId.toString();
    });

    if (communityInvitationIndex !== -1) {
      community.invitations.splice(communityInvitationIndex, 1);
      await community.save();
    }

    // Notify admins and send notifications
    const adminNotificationMessage = `${user.name} accepted the invitation to join the community "${community.name}"`;
    await createNotificationForOwner(req.user.id, community.admins, adminNotificationMessage);
    await sendNotificationsToCommunityMembers(community.id, req.user.id);
    await addHistory(req.user.id, `accepted Invitation for Community: "${community.name}"`);

    // Make the user join the community room
    const userSocketId = global.onlineUsers.get(req.user.id);
    if (userSocketId) {
      io.sockets.sockets.get(userSocketId).join(communityId);
      console.log(`User with socket ID ${userSocketId} joined community room ${communityId}`);
    } else {
      console.log('User is not connected to the socket.');
    }

    res.status(200).json({ message: 'Invitation accepted successfully' });
  } catch (error) {
    console.error('Error while accepting invitation:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
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
      return res.status(404).json({ message: 'User not found' });
    }

    // البحث عن الدعوة في قائمة دعوات المستخدم
    const invitationIndex = user.invitations.findIndex((invitation) => invitation._id.toString() === invitationId);
    if (invitationIndex === -1) {
      return res.status(400).json({ message: 'No invitation found for this ID' });
    }

    // الحصول على communityId قبل إزالة الدعوة
    const communityId = user.invitations[invitationIndex].communityId;
    if (!communityId) {
      return res.status(400).json({ message: 'Community ID missing in the invitation' });
    }

    // إزالة الدعوة من قائمة دعوات المستخدم
    user.invitations.splice(invitationIndex, 1);
    await user.save();

    // البحث عن الكوميونتي باستخدام communityId
    const community = await Community.findById(communityId);
    if (community) {
      // العثور على الدعوة في قائمة دعوات الكوميونتي
      const communityInvitationIndex = community.invitations.findIndex(invitation => invitation._id.toString() === invitationId);
      
      if (communityInvitationIndex !== -1) {
        // إزالة الدعوة من قائمة الدعوات الخاصة بالكوميونتي
        community.invitations.splice(communityInvitationIndex, 1);
        await community.save();
      }
    }

    res.status(200).json({ message: 'Invitation ignored successfully' });
  } catch (error) {
    console.error('Error ignoring invitation:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};
