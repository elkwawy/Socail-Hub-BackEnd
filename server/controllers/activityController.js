// Import necessary models
import FakeUser from '../models/FakeUser.js';
import Post from '../models/Post.js';
import Video from '../models/Video.js';
import FakeComment from '../models/FakeComment.js';
import Comment from '../models/Comment.js';
import Balance from '../models/Balance.js';
import { addHistory } from '../controllers/historyController.js';
import { decrypt } from './bycripting_algorithem.js';
import { createNotificationsForSubscribersOrFollowers } from './notification.js';

// Function to randomly select users from the FakeUser model
const getRandomUsers = async (count) => {
  const users = await FakeUser.aggregate([{ $sample: { size: count } }]);
  return users.map(user => user._id);
};

// Function to randomly select fake comments from the FakeComment model
const getFakeComments = async (count) => {
  const fakeComments = await FakeComment.aggregate([{ $sample: { size: count } }]);
  return fakeComments;
};

// Function to increment likes for a post or video
// Function to increment likes for a post or video
// Function to increment likes for a post or video
export const incrementLikes = async (req, res) => {
  try {
    const { objectKey, amount } = req.body;
    const userId = req.user?.id;

    if (!objectKey || !amount || !userId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Extract encrypted data and application name
    const keyParts = objectKey.split('-');
    if (keyParts.length !== 3) {
      return res.status(400).json({ success: false, message: 'Invalid objectKey format' });
    }

    const [encryptedData, iv, appName] = keyParts;
    if (appName !== 'Social_Hub') {
      return res.status(400).json({ success: false, message: 'Invalid application name in objectKey' });
    }

    // Decrypt objectKey to get uniqueIdentifier
    const uniqueIdentifier = decrypt(`${encryptedData}-${iv}`);

    // Find the object (post or video) using the objectKey
    const post = await Post.findOne({ postKey: objectKey });
    const video = await Video.findOne({ videoKey: objectKey });
    const object = post || video;

    if (!object) {
      return res.status(404).json({ success: false, message: 'Object not found' });
    }

    // Check user balance
    const userBalance = await Balance.findOne({ user: userId });

    if (!userBalance) {
      return res.status(404).json({ success: false, message: 'User balance not found' });
    }

    const costPerLike = 10; // Cost per like
    const totalCost = amount * costPerLike;

    if (userBalance.currentCoins < totalCost) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance to buy ${amount} likes. You need ${totalCost} coins.`,
      });
    }

    // Deduct coins
    userBalance.currentCoins -= totalCost;
    await userBalance.save();

    // Get random users to add likes
    const randomUsers = await getRandomUsers(amount);
    object.likes.push(...randomUsers);
    await object.save();

    res.status(200).json({
      success: true,
      message: 'Likes incremented successfully.',
      object,
      remainingCoins: userBalance.currentCoins,
    });
  } catch (error) {
    console.error('Error incrementing likes:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};



// Function to increment views for a video
export const incrementViews = async (req, res) => {
  try {
    const { videoKey, amount } = req.body;
    const userId = req.user?.id;

    if (!videoKey || !amount || !userId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Extract encrypted data and application name
    const keyParts = videoKey.split('-');
    if (keyParts.length !== 3) {
      return res.status(400).json({ success: false, message: 'Invalid videoKey format' });
    }

    const [encryptedData, iv, appName] = keyParts;
    if (appName !== 'Social_Hub') {
      return res.status(400).json({ success: false, message: 'Invalid application name in videoKey' });
    }

    // Decrypt videoKey to get uniqueIdentifier
    const uniqueIdentifier = decrypt(`${encryptedData}-${iv}`);

    // Find the video using videoKey
    const video = await Video.findOne({ videoKey });
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    // Check user balance
    const userBalance = await Balance.findOne({ user: userId });
    const costPerView = 5; // Cost per view
    const totalCost = amount * costPerView;

    if (!userBalance || userBalance.currentCoins < totalCost) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to buy views' });
    }

    // Deduct coins
    userBalance.currentCoins -= totalCost;
    await userBalance.save();

    // Increment views
    video.views += amount;
    await video.save();

    res.status(200).json({
      success: true,
      message: 'Views incremented successfully.',
      video,
      remainingCoins: userBalance.currentCoins,
    });
  } catch (error) {
    console.error('Error incrementing views:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Function to increment comments for a post or video
export const incrementComments = async (req, res) => {
  try {
    const { objectKey, amount } = req.body;
    const userId = req.user?.id;

    if (!objectKey || !amount || !userId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Extract encrypted data and application name
    const keyParts = objectKey.split('-');
    if (keyParts.length !== 3) {
      return res.status(400).json({ success: false, message: 'Invalid objectKey format' });
    }

    const [encryptedData, iv, appName] = keyParts;
    if (appName !== 'Social_Hub') {
      return res.status(400).json({ success: false, message: 'Invalid application name in objectKey' });
    }

    // Decrypt objectKey to get uniqueIdentifier
    const uniqueIdentifier = decrypt(`${encryptedData}-${iv}`);

    // Find the object (post or video) using the objectKey
    const post = await Post.findOne({ postKey: objectKey });
    const video = await Video.findOne({ videoKey: objectKey });
    const object = post || video;

    if (!object) {
      return res.status(404).json({ success: false, message: 'Object not found' });
    }

    // Check user balance
    const userBalance = await Balance.findOne({ user: userId });
    const costPerComment = 8; // Cost per comment
    const totalCost = amount * costPerComment;

    if (!userBalance || userBalance.currentCoins < totalCost) {
      return res.status(400).json({ success: false, message: 'Insufficient balance to buy comments' });
    }

    // Deduct coins
    userBalance.currentCoins -= totalCost;
    await userBalance.save();

    // Get fake comments
    const fakeComments = await getFakeComments(amount);
    const newComments = [];

    for (const fakeComment of fakeComments) {
      const newComment = new Comment({
        userId: fakeComment.userId,
        objectId: object._id,
        desc: fakeComment.desc,
      });
      await newComment.save();
      object.comments.push(newComment._id);
      newComments.push(newComment);
    }

    await object.save();

    res.status(200).json({
      success: true,
      message: 'Comments incremented successfully.',
      object,
      newComments,
      remainingCoins: userBalance.currentCoins,
    });
  } catch (error) {
    console.error('Error incrementing comments:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
