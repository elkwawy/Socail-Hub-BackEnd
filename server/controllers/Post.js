import Post from "../models/Post.js";
import { createError } from "../error.js";
import User from "../models/User.js";
import { createNotificationsForSubscribersOrFollowers } from '../controllers/notification.js';
import { createNotificationForOwner } from './notification.js'; // Assuming you have the notification functions in a separate file


export const addPost = async (req, res, next) => {
  try {
    // Find the user by ID to retrieve their name
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Create a new post
    const newPost = new Post({ userId: req.user.id, ...req.body });
    const savedPost = await newPost.save();

    // Create a notification message with the user's name
    const message = `New post added by ("${user.name}")`;

    // Create notifications for subscribers or followers
    await createNotificationsForSubscribersOrFollowers(req.user.id, message);

    res.status(200).json(savedPost);
  } catch (err) {
    next(err);
  }
};


export const updatePost = async (req, res, next) => {
  try {
    const founded = await Post.findById(req.params.id);
    if (!founded) return next(createError(404, "Post not found!"));
    if (req.user.id === founded.userId) {
      const updatedPost = await Post.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );
      res.status(200).json(updatedPost);
    } else {
      return next(createError(403, "You can update only your Post!"));
    }
  } catch (err) {
    next(err);
  }
};

export const deletePost = async (req, res, next) => {
  try {
    const founded = await Post.findById(req.params.id);
    if (!founded) return next(createError(404, "Post not found!"));
    if (req.user.id === founded.userId) {
      await Post.findByIdAndDelete(req.params.id);
      res.status(200).json("The Post has been deleted.");
    } else {
      return next(createError(403, "You can delete only your Post!"));
    }
  } catch (err) {
    next(err);
  }
};

export const getPostsById = async (req, res, next) => {
  const userId = req.params.id;
  
  try {
    const posts = await Post.find({ userId });
    res.status(200).json(posts);
  } catch (err) {
    next(err);
  }
};


export const random = async (req, res, next) => {
  try {
    const posts = await Post.aggregate([{ $sample: { size: 40 } }]);
    res.status(200).json(posts);
  } catch (err) {
    next(err);
  }
};










export const likePost = async (req, res, next) => {
  const loggedInUserId = req.user.id; // Assuming you have the ID of the currently signed-in user
  const postId = req.params.id;

  try {
    // Retrieve the post and owner information
    const post = await Post.findById(postId);
    if (!post) {
      return next(createError(404, 'Post not found'));
    }

    const ownerId = post.userId; // Assuming 'userId' field in Post model represents the owner's user ID

    // Check if the user has already liked the post
    if (post.likes.includes(loggedInUserId)) {
      return res.status(400).json({ error: 'You have already liked this post before' });
    }

    // Define senderId assuming it comes from the currently signed-in user
    const senderId = req.user.id;

    // Check if the receiver is blocked by the sender
    const isReceiverBlocked = await isUserBlocked(senderId, ownerId); // Assuming ownerId represents the receiver

    if (isReceiverBlocked) {
      return res.status(403).json({ success: false, message: 'Cannot like to blocked users' });
    }

    // Remove user from dislikes list if they are present
    if (post.dislikes.includes(loggedInUserId)) {
      post.dislikes.pull(loggedInUserId); // Remove user from dislikes list
    }

    // Update the post's likes array to include the user's ID
    post.likes.push(loggedInUserId);
    await post.save();

    const loggedInUser = await User.findById(loggedInUserId);
    const loggedInUserName = loggedInUser.name;
    
    // Notify the owner of the post
    const notificationMessage = `"${loggedInUserName}" liked your post`; // Customize the message as needed
    await createNotificationForOwner(loggedInUserId, ownerId, notificationMessage);

    res.status(200).json({ message: 'Post liked successfully' });
  } catch (err) {
    next(err);
  }
};











export const dislikePost = async (req, res, next) => {
  const loggedInUserId = req.user.id; // Assuming you have the ID of the currently signed-in user
  const postId = req.params.id;

  try {
    const post = await Post.findById(postId);
    if (!post) {
      return next(createError(404, 'Post not found'));
    }

    // Check if the user has already disliked the post
    if (post.dislikes.includes(loggedInUserId)) {
      return res.status(400).json({ error: 'You have already disliked this post' });
    }

    // Define senderId assuming it comes from the currently signed-in user
    const senderId = req.user.id;

    // Check if the receiver is blocked by the sender
    const isReceiverBlocked = await isUserBlocked(senderId, post.userId); // Assuming post.userId represents the receiver

    if (isReceiverBlocked) {
      return res.status(403).json({ success: false, message: 'Cannot send dislike to blocked users' });
    }

    // Remove user from likes list if they are present
    if (post.likes.includes(loggedInUserId)) {
      post.likes.pull(loggedInUserId); // Remove user from likes list
    }

    // Update the post's dislikes array to include the user's ID
    post.dislikes.push(loggedInUserId);
    await post.save();

    // Retrieve the user's name
    const loggedInUser = await User.findById(loggedInUserId);
    const loggedInUserName = loggedInUser.name;

    // Notify the owner of the post
    const ownerId = post.userId; // Assuming 'userId' field in Post model represents the owner's user ID
    const notificationMessage = `"${loggedInUserName}" disliked your post`; // Use the user's name in the message
    await createNotificationForOwner(loggedInUserId, ownerId, notificationMessage);

    res.status(200).json({ message: 'Post disliked successfully' });
  } catch (err) {
    next(err);
  }
};



export const savePost = async (req, res, next) => {
  const loggedInUserId = req.user.id; // Assuming you have the ID of the currently signed-in user
  const postId = req.params.id;

  try {
    // Find the user by ID
    const user = await User.findById(loggedInUserId);
    if (!user) {
      return next(createError(404, 'User not found'));
    }

    // Check if user.savedPosts is defined
    if (!user.savedPosts) {
      console.error('User savedPosts array is undefined');
      return next(createError(500, 'User saved '));
    }

    // Check if the Post is already saved
    if (user.savedPosts.includes(postId)) {
      return res.status(400).json({ success: false, message: 'Post already saved' });
    }

    // Add the Post ID to the user's savedPost array
    user.savedPosts.push(postId);
    await user.save();

    // Retrieve the user's name
    const loggedInUserName = user.name;

    // Retrieve the owner's ID from the post
    const post = await Post.findById(postId);
    if (!post) {
      return next(createError(404, 'Post not found'));
    }
    const ownerId = post.userId; // Assuming 'userId' field in Post model represents the owner's user ID

    // Notify the owner of the post
    const notificationMessage = `"${loggedInUserName}" saved your post`; // Use the user's name in the message
    await createNotificationForOwner(loggedInUserId, ownerId, notificationMessage);

    res.status(200).json({ success: true, message: 'Post saved successfully' });
  } catch (err) {
    next(err);
  }
};

export const unsavePost = async (req, res, next) => {
  try {
    const loggedInUserId = req.user.id; // Assuming you have the ID of the currently signed-in user

    // Find the user by ID
    const user = await User.findById(loggedInUserId);
    if (!user) return next(createError(404, 'User not found!'));

    // Check if Post exists
    const post = await Post.findById(req.params.id); // Rename this to avoid conflict
    if (!post) return next(createError(404, 'Post not found!'));

    // Check if the Post is saved
    const isSaved = user.savedPosts.includes(req.params.id);
    if (!isSaved) return next(createError(400, 'Post is not saved!'));

    // Remove the Post from the saved list
    user.savedPosts = user.savedPosts.filter(id => id !== req.params.id);
    await user.save();

    // Retrieve the user's name
    const loggedInUserName = user.name;

    // Retrieve the owner's ID from the post
    const ownerId = post.userId; // Assuming 'userId' field in Post model represents the owner's user ID

    // Notify the owner of the post
    const notificationMessage = `${loggedInUserName} unsaved your post`; // Use the user's name in the message
    await createNotificationForOwner(loggedInUserId, ownerId, notificationMessage);

    res.status(200).json({ message: 'Post unsaved successfully.' });
  } catch (err) {
    next(err);
  }
};


//...........................??????????
export const copyUrl = async (req, res, next) => {
  try {
    const podt = await Post.findById(req.params.id);
    if (!podt) {
      return next(createError(404, "Post not found"));
    }
    
    // Extract the Post URL
    const postUrl = Post.id;

    res.status(200).json({ success: true, postUrl });
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

