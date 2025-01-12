import { exec } from 'child_process';
import User from '../models/User.js';
import Balance from '../models/Balance.js';
import Comment from '../models/Comment.js';
import Message from '../models/Message.js';
import Post from '../models/Post.js'; // Import the Post model
import PremiumPlan from '../models/premiumPlanModel.js';
import { createSystemNotificationForUser } from './notification.js';
import mongoose from 'mongoose';
import Report from '../models/Report.js'; // Assuming you have created the Report model
import stringSimilarity from 'string-similarity';
import { Types } from 'mongoose';

// Function to get user by name
const getUserByName = async (name) => {
  return await User.findOne({ name });
};

export const addCoins = async (userId, amount) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.coins = (user.coins || 0) + amount; // Adding coins
    await user.save();
  } catch (error) {
    console.error(`Failed to add coins to user ${userId}:`, error.message);
    throw error;
  }
};
// Function to deduct coins from the user's balance
const deductCoins = async (userId, amount) => {
  try {
    const userBalance = await Balance.findOne({ user: userId });
    if (!userBalance) {
      throw new Error('User balance not found');
    }
    userBalance.currentCoins -= amount;
    await userBalance.save();
    return userBalance.currentCoins;
  } catch (error) {
    throw error;
  }
};

// Function to get daily report limit based on premium plan
const getDailyReportLimit = async (userId) => {
  const premiumPlan = await PremiumPlan.findOne({ user: userId });
  if (!premiumPlan) {
    return 1; // Default limit for non-premium users
  }

  switch (premiumPlan.planType) {
    case 'business':
      return 2;
    case 'vip':
    case 'superVIP':
      return 3;
    default:
      return 1;
  }
};

// Function to calculate remaining time until reset
const getTimeUntilReset = () => {
  const now = new Date();
  const resetTime = new Date(now);
  resetTime.setDate(now.getDate() + 1);
  resetTime.setHours(0, 0, 0, 0);

  const diff = resetTime - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return { hours, minutes };
};


export const report = async (req, res, next) => {
  try {
    const pythonScriptPath = "D:\\Programming\\Work\\Socail-Hub-BackEnd\\CommentToxicity-main\\Main.py";
    const sexualWordsPath = "D:\\Programming\\Work\\Socail-Hub-BackEnd\\CommentToxicity-main\\Sexual_Words.txt";
    const violenceWordsPath = "D:\\Programming\\Work\\Socail-Hub-BackEnd\\CommentToxicity-main\\Vaulance_Words.txt";
    const threatWordsPath = "D:\\Programming\\Work\\Socail-Hub-BackEnd\\CommentToxicity-main\\Threaten_Words.txt";
    
    const { input_sentence, user_name, message_type } = req.body;

    const user = await getUserByName(user_name);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (req.user.id === user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You cannot report yourself.' });
    }

    let isContentFound = false;

    if (message_type === 'message') {
      const messages = await Message.find({ senderId: user._id });
      const similarMessage = messages.find((message) =>
        stringSimilarity.compareTwoStrings(message.content.trim(), input_sentence.trim()) >= 0.95
      );

      if (similarMessage) {
        isContentFound = true;
        await Message.deleteOne({ _id: similarMessage._id });
      }
    }

    if (message_type === 'comment' && !isContentFound) {
      const posts = await Post.find({ userId: user._id });
      const postWithComment = posts.find((post) =>
        stringSimilarity.compareTwoStrings(post.desc.trim(), input_sentence.trim()) >= 0.95
      );

      if (postWithComment) {
        isContentFound = true;
      }
    }

    if (!isContentFound) {
      return res.status(400).json({
        success: false,
        message: `No matching message or post was found for this content.`,
      });
    }

    console.log("Executing Python script...");
    exec(
      `python "${pythonScriptPath}" "${sexualWordsPath}" "${violenceWordsPath}" "${threatWordsPath}" "${input_sentence}"`,
      async (error, stdout, stderr) => {
        if (error) {
          console.error('Error processing report:', error);
          return res.status(500).json({ success: false, message: 'Error processing report' });
        }

        const results = JSON.parse(stdout);
        let deduction = 0;

        results.forEach((result) => {
          if (result[1] === 'Sexual') deduction += 300;
          if (result[1] === 'Violence' || result[1] === 'Threat') deduction += 150;
        });

        const newReport = new Report({
          user: req.user.id,
          reportedUser: user._id,
          content: input_sentence,
          contentType: message_type,
          reason: results.map((result) => result[1]).join(', '),
          status: deduction > 0 ? 'reviewed' : 'pending',
        });

        await newReport.save();

        if (deduction > 0) {
          await deductCoins(user._id, deduction);
          await addCoins(req.user.id, deduction);

          await User.findByIdAndUpdate(req.user.id, { $inc: { balance: deduction } });
          await User.findByIdAndUpdate(user._id, { $inc: { balance: -deduction } });

          if (user._id !== 'system') {
            await createSystemNotificationForUser(
              new mongoose.Types.ObjectId(user._id),
              `Your content was flagged as inappropriate. ${deduction} coins were deducted.`
            );
          }

          await createSystemNotificationForUser(
            new mongoose.Types.ObjectId(req.user.id),
            `You have received ${deduction} coins for reporting inappropriate content.`
          );
        }

        if (input_sentence.toLowerCase().includes("airport")) {
          results.forEach(async (result) => {
            if (['Sexual', 'Violence', 'Threat'].includes(result[1])) {
              await deductCoins(user._id, 500);
              await addCoins(req.user.id, 500);
              await User.findByIdAndUpdate(req.user.id, { $inc: { balance: 500 } });
              await User.findByIdAndUpdate(user._id, { $inc: { balance: -500 } });

              if (user._id !== 'system') {
                await createSystemNotificationForUser(
                  new mongoose.Types.ObjectId(user._id),
                  `Your airport-related content was flagged as highly inappropriate. 500 coins were deducted.`
                );
              }

              await createSystemNotificationForUser(
                new mongoose.Types.ObjectId(req.user.id),
                `You have received 500 coins for reporting highly inappropriate airport-related content.`
              );
            }
          });
        }

        return res.status(200).json({ success: true, results, deduction });
      }
    );
  } catch (error) {
    console.error('Error processing report:', error);
    return res.status(500).json({ success: false, message: 'Error processing report' });
  }
};






// Function to get all reports made by the current user
const getUserReports = async (req, res) => {
  try {
    const userId = req.user.id; // Retrieve the user ID from the authenticated request

    // Fetch reports from the database where the user is the reporter
    const userReports = await Report.find({ user: userId }).populate({
      path: 'reportedUser',
      select: 'name profilePicture',
    });

    // Return the reports to the client
    return res.status(200).json({
      success: true,
      reports: userReports,
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching user reports',
    });
  }
};

export { getUserReports };
