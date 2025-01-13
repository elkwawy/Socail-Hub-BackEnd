import { createError } from "../error.js";
import Comment from "../models/Comment.js";
import Video from "../models/Video.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import FakeComment from '../models/FakeComment.js'; // Import the FakeComment model
import { addHistory } from '../controllers/historyController.js'; // Import the function to add history entries
import mongoose from "mongoose";

import { createNotificationForOwner } from './notification.js'; // Assuming you have the notification functions in a separate file

export const addComment = async (req, res, next) => {
  const { objectId, desc, category } = req.body; // Require objectId, desc, and optional category
  const userId = req.user.id;

  try {
    // Validate if the objectId corresponds to a video or a post
    const video = await Video.findById(objectId);
    const post = await Post.findById(objectId);

    // If objectId is not valid for a video or post, return an error
    if (!video && !post) {
      return res.status(400).json({
        success: false,
        message: "Invalid objectId. Comments can only be added to valid videos or posts.",
      });
    }

    // Create a new root comment
    const newComment = new Comment({
      userId,
      objectId,
      desc,
      replies: [], // Initialize with an empty replies array
      category: category || "root", // Explicitly set the category or default to "root"
    });

    const savedComment = await newComment.save();

    // Populate user details for response
    const user = await User.findById(userId).select('name profilePicture');

    if (video) {
      video.comments.push(savedComment._id);
      await video.save();

      await addHistory(userId, `You added a comment on video: "${video.title}"`);
      const notificationMessage = `New comment on your video: "${desc}"`;
      await createNotificationForOwner(userId, video.userId, notificationMessage);

      return res.status(200).json({
        success: true,
        message: "Comment added to video successfully.",
        comment: {
          ...savedComment.toObject(),
          userId: {
            _id: userId,
            name: user.name,
            profilePicture: user.profilePicture,
          },
        },
      });
    }

    if (post) {
      post.comments.push(savedComment._id);
      await post.save();

      await addHistory(userId, `You added a comment on post: "${post.title}"`);
      const notificationMessage = `New comment on your post: "${desc}"`;
      await createNotificationForOwner(userId, post.userId, notificationMessage);

      return res.status(200).json({
        success: true,
        message: "Comment added to post successfully.",
        comment: {
          ...savedComment.toObject(),
          userId: {
            _id: userId,
            name: user.name,
            profilePicture: user.profilePicture,
          },
        },
      });
    }
  } catch (err) {
    console.error("Error adding comment:", err);
    next(err);
  }
};



export const isCommentByUser = async (req, res, next) => {
  const { commentId } = req.params; // Require commentId from request parameters
  const userId = req.user.id; // Get the current user's ID

  try {
    // Find the comment by its ID
        // Find the comment by its ID

    const comment = await Comment.findById(commentId);

    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Check if the comment was made by the current user
    const isByMe = comment.userId.toString() === userId;

    return res.status(200).json({
      success: true,
      isByMe,
    });
  } catch (err) {
    console.error("Error checking comment ownership:", err);
    next(err);
  }
};








export const addReply = async (req, res, next) => {
  const { commentId, desc } = req.body; // Require commentId and reply description
  const userId = req.user.id;

  try {
    // Find the comment being replied to
    const parentComment = await Comment.findById(commentId).populate({
      path: 'userId',
      select: 'name profilePicture',
    });
    if (!parentComment) {
      return res.status(404).json({ success: false, message: "Parent comment not found" });
    }

    // Check if the user being replied to is blocked
    const receiverId = parentComment.userId._id;
    const isReceiverBlocked = await isUserBlocked(userId, receiverId);
    if (isReceiverBlocked) {
      return res.status(403).json({ success: false, message: "Cannot reply to blocked users" });
    }

    // Create a new reply
    const newReply = new Comment({
      userId,
      objectId: parentComment.objectId, // Keep the same objectId
      desc,
      replies: [], // Initialize with an empty array for nested replies
      replyTo: parentComment._id, // Link to the parent comment
    });

    const savedReply = await newReply.save();

    // Determine if the parent comment is a root or nested reply
    if (!parentComment.replyTo) {
      // Parent is a root comment
      parentComment.replies.push(savedReply._id);
      await parentComment.save();
    } else {
      // Parent is a nested reply
      // Find the root comment
      let rootComment = parentComment;
      while (rootComment.replyTo) {
        rootComment = await Comment.findById(rootComment.replyTo);
        if (!rootComment) {
          return res.status(404).json({ success: false, message: "Root comment not found" });
        }
      }

      // Add reply to the parent and root comment
      parentComment.replies.push(savedReply._id);
      await parentComment.save();

      rootComment.replies.push(savedReply._id);
      await rootComment.save();
    }

    // Notify the owner of the parent comment
    const parentCommentOwner = await User.findById(parentComment.userId._id);
    if (parentCommentOwner) {
      const notificationMessage = `${req.user.name} replied to your comment: "${desc}"`;
      await createNotificationForOwner(userId, parentCommentOwner._id, notificationMessage);
    }

    // Add history for the user making the reply
    await addHistory(userId, `You replied to a comment: "${desc}"`);

    // Fetch user details
    const user = await User.findById(userId).select('name profilePicture');

    return res.status(200).json({
      success: true,
      message: "Reply added successfully.",
      reply: savedReply,
      user: {
        userId: userId,
        name: user.name,
        profilePicture: user.profilePicture,
      },
      replyTo: {
        id: parentComment._id,
        name: parentComment.userId.name,
      },
    });
  } catch (err) {
    console.error("Error adding reply:", err);
    next(err);
  }
};






export const getReplies = async (req, res, next) => {
  const { commentId } = req.params;

  try {
    // Find the root comment and populate replies, user details, and replyTo
    const rootComment = await Comment.findById(commentId)
      .populate({
        path: 'replies',
        populate: [
          {
            path: 'userId',
            select: 'name profilePicture',
          },
          {
            path: 'replies',
            populate: [
              {
                path: 'userId',
                select: 'name profilePicture',
              },
              {
                path: 'replyTo',
                populate: {
                  path: 'userId',
                  select: 'name',
                },
              },
            ],
          },
          {
            path: 'replyTo',
            populate: {
              path: 'userId',
              select: 'name',
            },
          },
        ],
      })
      .populate({
        path: 'userId',
        select: 'name profilePicture',
      })
      .lean(); // Convert the rootComment to a plain object

    if (!rootComment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    // Transform the user data
    const transformUser = (user) => ({
      userId: user._id, // Include user ID
      name: user.name,
      profilePicture: user.profilePicture,
    });

    // Transform replies
    const transformReplies = (replies) =>
      replies.map((reply) => ({
        userId: reply.userId?._id, // Include user ID for the reply
        category: reply.category || "General", // Default category if not provided
        desc: reply.desc, // Include the description/content of the reply
        objectId: reply._id, // Include the ID as objectId
        user: reply.userId ? transformUser(reply.userId) : null,
        replyTo: reply.replyTo
          ? {
              name: reply.replyTo.userId?.name || null, // Include the name of the user being replied to
              userId: reply.replyTo.userId?._id || null, // Include userId of the user being replied to
            }
          : null,
        replies: transformReplies(reply.replies || []),
      }));

    return res.status(200).json({
      success: true,
      message: "Replies fetched successfully.",
      category: rootComment.category || "General", // Include category for root comment
      desc: rootComment.desc, // Description of the root comment
      objectId: rootComment._id,
      user: rootComment.userId ? transformUser(rootComment.userId) : null,
      replies: rootComment.replies?.length > 0 ? transformReplies(rootComment.replies) : [], // Return empty array if no replies
    });
  } catch (err) {
    console.error("Error fetching replies:", err);
    next(err);
  }
};







export const deleteComment = async (req, res, next) => {
  const commentId = req.params.commentId;
  const userId = req.user.id;  // Assuming you store user info in req.user

  try {
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
      return next(createError(400, "Invalid comment ID format."));
    }

    // Find the comment by ID
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return next(createError(404, "Comment not found."));
    }

    // Find the object (video or post) associated with the comment
    let object;
    let objectType = '';
    
    // Check if the comment is associated with a video
    const video = await Video.findById(comment.objectId);
    if (video) {
      object = video;
      objectType = 'video';
    }

    // Check if the comment is associated with a post
    const post = await Post.findById(comment.objectId);
    if (post) {
      object = post;
      objectType = 'post';
    }

    // If no associated video or post found
    if (!object) {
      return next(createError(404, "No associated video or post found for this comment."));
    }

    // Check if the user trying to delete the comment is the owner of the video or post
    if (String(object.userId) !== String(userId)) {
      return next(createError(403, "You do not have permission to delete this comment."));
    }

    // Remove the comment from the associated object (video or post)
    if (objectType === 'video') {
      object.comments = object.comments.filter(c => !c.equals(commentId));
      await object.save();
    } else if (objectType === 'post') {
      object.comments = object.comments.filter(c => !c.equals(commentId));
      await object.save();
    }

    // Delete the comment using findByIdAndDelete
    await Comment.findByIdAndDelete(commentId);

    return res.status(200).json({
      success: true,
      message: "Comment deleted successfully.",
    });

  } catch (err) {
    console.error("Error deleting comment:", err);
    next(err);
  }
};

export const getCommentsByObjectId = async (req, res, next) => {
  try {
    // Fetch comments for the specified objectId with category "root"
    const comments = await Comment.find({ objectId: req.params.objectId, category: "root" })
      .populate({
        path: 'userId', // Assuming the field that links to the user is 'userId'
        select: 'name profilePicture', // Only include name and profilePicture from User
      });

    // Return an empty array if no comments are found
    if (!comments || comments.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(comments);
  } catch (err) {
    next(err);
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

