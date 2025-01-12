import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Community from '../models/Community.js';
import globalIO from "../socket.js"; // افترض أن io يتم تصديره من ملف مخصص

const notificationCache = new Map();

export const getNotificationsByUserId = async (req, res) => {
    try {
        const userId = req.params.userId;
        const limit = 10; // Number of notifications per call

        // Initialize or get the user's current state
        if (!notificationCache.has(userId)) {
            notificationCache.set(userId, { skip: 0, exhausted: false });
        }

        const userState = notificationCache.get(userId);

        let skip = userState.skip;

        // Fetch notifications with pagination
        const notifications = await Notification.find({ TO: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // If no notifications found
        if (!notifications || notifications.length === 0) {
            if (!userState.exhausted) {
                // Mark as exhausted and notify
                userState.exhausted = true;
                notificationCache.set(userId, userState);

                return res.status(200).json({
                    message: 'No new notifications found. Starting from the beginning...',
                });
            } else {
                // Reset state to start from the beginning
                userState.skip = 0;
                userState.exhausted = false;
                notificationCache.set(userId, userState);

                // Retry fetching from the beginning
                skip = 0;
                const resetNotifications = await Notification.find({ TO: userId })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit);

                if (!resetNotifications || resetNotifications.length === 0) {
                    return res.status(200).json({
                        message: 'No notifications found even after resetting.',
                    });
                }

                // Return the reset notifications
                userState.skip += resetNotifications.length;
                notificationCache.set(userId, userState);
                return res.status(200).json({ notifications: resetNotifications });
            }
        }

        // Update state and return notifications
        userState.exhausted = false;
        userState.skip += notifications.length;
        notificationCache.set(userId, userState);

        res.status(200).json({ notifications });
    } catch (error) {
        console.error(error);
        if (!res.headersSent) {
            res.status(500).json({ message: 'Server Error' });
        }
    }
};

export const newNotifications = async (req, res) => {
    try {
        const userId = req.params.userId;

        // Fetch unread notifications
        const unreadNotifications = await Notification.find({ TO: userId, isRead: false })
            .sort({ createdAt: -1 });

        // If no unread notifications, return an empty array
        if (!unreadNotifications || unreadNotifications.length === 0) {
            return res.status(200).json([]);
        }

        // Emit the unread notifications to all connected users via Socket.io
        const userSocket = global.onlineUsers.get(userId);
        if (userSocket) {
            globalIO.emit("new-notification", unreadNotifications);
            console.log(`Notifications emitted to all users:`, unreadNotifications);
        }

        // Return unread notifications
        res.status(200).json(unreadNotifications);
    } catch (error) {
        console.error('Error fetching new notifications:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};








export const sendNotificationsToCommunityMembers = async (communityId, newMemberId) => {
    try {
        // Find the community
        const community = await Community.findById(communityId);

        // Ensure that the community and its members are defined
        if (!community || !community.members || community.members.length === 0) {
            return;
        }

        // Create a notification message for the new member
        const notificationMessage = `${await getUserFullName(newMemberId)} joined the community`;

        // Create a notification for each community member (excluding the new member)
        const notifications = community.members
            .filter(memberId => memberId.toString() !== newMemberId.toString())
            .map(memberId => ({
                message: notificationMessage,
                TO: memberId,
                FROM: newMemberId,
            }));

        // Insert the notifications into the database
        await Notification.insertMany(notifications);

        // Emit the notifications to all community members (excluding the new member) via Socket.io
        community.members
            .filter(memberId => memberId.toString() !== newMemberId.toString())
            .forEach(memberId => {
                const userSocket = global.onlineUsers.get(memberId.toString());
                if (userSocket) {
                    globalIO.to(userSocket).emit("new-notification", {
                        message: notificationMessage,
                        TO: memberId,
                        FROM: newMemberId,
                    });
                    console.log(`Notification emitted to user ${memberId}: ${notificationMessage}`);
                }
            });
    } catch (error) {
        console.error('Error sending community member notifications:', error);
    }
};








const getUserFullName = async (userId) => {
    try {
        const user = await User.findById(userId);
        return user ? user.name : '';
    } catch (error) {
        console.error('Error getting user full name:', error);
        return '';
    }
};



export const createNotificationsForSubscribersOrFollowers = async (userId, message) => {
    try {
        // Find the user who added the video
        const user = await User.findById(userId);
        if (!user) return;

        // Get the list of subscribers or followers
        const subscribersOrFollowers = user.SubscribersOrFollowers;
        if (!subscribersOrFollowers || subscribersOrFollowers.length === 0) return;

        // Create a notification for each subscriber or follower
        const notifications = subscribersOrFollowers.map(subscriberId => ({
            message,
            TO: subscriberId,
            FROM: userId
        }));

        // Insert the notifications into the database
        await Notification.insertMany(notifications);

        // Emit the notifications to all subscribers or followers via Socket.io
        subscribersOrFollowers.forEach(subscriberId => {
            const userSocket = global.onlineUsers.get(subscriberId.toString());
            if (userSocket) {
                globalIO.to(userSocket).emit("new-notification", {
                    message,
                    TO: subscriberId,
                    FROM: userId,
                });
                console.log(`Notification emitted to subscriber ${subscriberId}: ${message}`);
            }
        });
    } catch (error) {
        console.error('Error creating notifications:', error);
    }
};

export const getNotificationsByUser = async (req, res) => {
    try {
        const userId = req.params.userId;
        const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });

        // Emit the notifications to the specific user via Socket.io
        const userSocket = global.onlineUsers.get(userId);
        if (userSocket) {
            globalIO.to(userSocket).emit('user-notifications', notifications);
            console.log(`Notifications emitted to user ${userId}:`, notifications);
        }

        res.json(notifications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};


export const createNotificationForOwner = async (loggedInUserId, ownerId, message) => {
    try {
        // Create a notification for the owner
        const notification = {
            message,
            TO: ownerId,  // Ensure that this line sets the TO field to the ownerId
            FROM: loggedInUserId,
        };

        // Insert the notification into the database
        await Notification.create(notification);
    } catch (error) {
        console.error('Error creating notification for owner:', error);
    }
};

export const createNotificationForUser = async (fromUserId, toUserId, message) => {
    try {
        const notification = {
            message,
            FROM: fromUserId,
            TO: toUserId,
        };

        const newNotification = await Notification.create(notification);

        // Emit the notification to the targeted user
        const userSocket = global.onlineUsers.get(toUserId);
        if (userSocket) {
            globalIO.to(userSocket).emit("new-notification", newNotification);
            console.log(`Notification emitted to user ${toUserId}: ${message}`);
        }
    } catch (error) {
        console.error("Error creating notification for user:", error);
    }
};

export const createSystemNotificationForUser = async (toUserId, message) => {
    try {
        // Create a notification from the system
        const systemNotification = {
            message,
            FROM_SYS: 'system',  // Set the sender as 'system'
            TO: toUserId
        };

        // Insert the system notification into the database
        await Notification.create(systemNotification);
    } catch (error) {
        console.error('Error creating system notification for user:', error);
    }
};

// Fetch unread notifications without changing their status
export const getUnreadNotifications = async (req, res) => {
    try {
        const userId = req.params.userId;

        // Fetch notifications where isRead is false
        const unreadNotifications = await Notification.find({ TO: userId, isRead: false })
            .sort({ createdAt: -1 });

        if (!unreadNotifications || unreadNotifications.length === 0) {
            return res.status(200).json({ message: 'No unread notifications.' });
        }

        res.status(200).json({ notifications: unreadNotifications });
    } catch (error) {
        console.error('Error fetching unread notifications:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

export const markNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.params.userId;

        // Fetch unread notifications for the user
        const unreadNotifications = await Notification.find({ TO: userId, isRead: false });

        if (unreadNotifications.length === 0) {
            return res.status(200).json({ 
                message: 'No new unread notifications to mark as read.', 
                updatedCount: 0 
            });
        }

        // Update all unread notifications to mark them as read
        await Notification.updateMany(
            { TO: userId, isRead: false },
            { $set: { isRead: true } }
        );

        res.status(200).json({ 
            message: 'All unread notifications marked as read.', 
            updatedCount: unreadNotifications.length 
        });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};
