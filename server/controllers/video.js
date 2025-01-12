import User from "../models/User.js";
import Video from "../models/Video.js";
import { createError } from "../error.js";
import View from '../models/View.js';
import { createNotificationsForSubscribersOrFollowers } from '../controllers/notification.js';
import { addHistory } from '../controllers/historyController.js'; // Import the function to add history entries
import { encrypt } from './bycripting_algorithem.js'; // استدعاء ملف التشفير
import mongoose from "mongoose";







export const saveVideo = async (req, res, next) => {
  const userId = req.user.id;
  const videoId = req.params.id;

  try {
    // العثور على المستخدم
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // التأكد من وجود قائمة savedVideos
    if (!user.savedVideos) {
      user.savedVideos = [];
    }

    // العثور على الفيديو
    const video = await Video.findById(videoId);
    if (!video) {
      return next(createError(404, "Video not found"));
    }

    // جلب بيانات صاحب الفيديو
    const videoOwner = await User.findById(video.userId);
    if (!videoOwner) {
      return next(createError(404, "Owner details not found for this video"));
    }

    // التحقق إذا كان الفيديو محفوظًا مسبقًا
    const alreadySaved = user.savedVideos.find(
      (savedItem) => savedItem._id.toString() === videoId
    );
    if (alreadySaved) {
      return res.status(400).json({ success: false, message: "Video already saved" });
    }

    // إضافة الفيديو مع بيانات صاحب الفيديو إلى savedVideos
    user.savedVideos.push({
      _id: video._id,
      title: video.title,
      description: video.description,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl,
      views: video.views,
      tags: video.tags,
      likes: video.likes,
      dislikes: video.dislikes,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      ownerName: videoOwner.name, // إضافة اسم صاحب الفيديو
      ownerProfilePicture: videoOwner.profilePicture, // إضافة صورة بروفايل صاحب الفيديو
      ownerId: video.userId, // إضافة معرف صاحب الفيديو
    });

    // حفظ التحديثات في بيانات المستخدم
    await user.save();

    // إضافة سجل نشاط
    await addHistory(req.user.id, `You saved a video: ${video.title}`);

    res.status(200).json({ success: true, message: "Video saved successfully" });
  } catch (err) {
    console.error("Error saving video:", err);
    next(err);
  }
};


export const addVideo = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    const uniqueIdentifier = `${req.user.id}-${Date.now()}-${Math.random()}`;
    const appName = "Social_Hub";

    const videoKey = `${encrypt(uniqueIdentifier)}-${appName}`;

    const newVideo = new Video({
      userId: req.user.id,
      videoKey,
      ...req.body,
      owner: req.user.id, // Assign user ID as owner
      ownerName: user.name, // Store owner's name
      ownerProfilePicture: user.profilePicture, // Store owner's profile picture
    });

    const savedVideo = await newVideo.save();

    const message = `New video added: ${savedVideo.title} Link: ${savedVideo.videoUrl} --->>> By ${user.name}`;

    await createNotificationsForSubscribersOrFollowers(req.user.id, message);

    await addHistory(req.user.id, `You added a new video: ${savedVideo.title}`);

    res.status(200).json(savedVideo);
  } catch (err) {
    console.error('Error adding video:', err.message);
    next(err);
  }
};



export const updateVideo = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(createError(404, "User not found"));
    }
    // Find the video by ID
    const video = await Video.findById(req.params.id);
    if (!video) return next(createError(404, "Video not found!"));

    // Check if the user is the owner of the video
    if (req.user.id === video.userId) {
      // Update the video
      const updatedVideo = await Video.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true }
      );

      // Create notifications for subscribers or followers
      await createNotificationsForSubscribersOrFollowers(
        req.user.id,
        `Video updated: ${updatedVideo.title} - ${updatedVideo.videoUrl} By (${user.name})`
      );

      // Respond with the updated video
      res.status(200).json(updatedVideo);
    } else {
      // If the user is not the owner of the video, return a 403 error
      return next(createError(403, "You can update only your video!"));
    }
  } catch (err) {
    // Pass any errors to the error handler middleware
    next(err);
  }
};


export const deleteVideo = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return next(createError(404, "Video not found!"));
    if (req.user.id === video.userId) {
      await Video.findByIdAndDelete(req.params.id);
      await addHistory(req.user.id, `You Delete Video : ${video.title}" `);

      res.status(200).json("The video has been deleted.");
    } else {
      return next(createError(403, "You can delete only your video!"));
    }
  } catch (err) {
    next(err);
  }
};

export const getVideosByUser = async (req, res, next) => {
  try {
    const { userId } = req.params; // Extract userId from the URL
    console.log("Fetching videos for userId:", userId); // Debugging log

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const videos = await Video.find({ userId });

    if (!videos.length) {
      return res.status(404).json({ success: false, message: "No videos found for this user." });
    }

    res.status(200).json({ success: true, videos });
  } catch (err) {
    console.error("Error fetching videos:", err.message); // Log the error
    next(err);
  }
};






export const addView = async (req, res, next) => {
  try {
    const videoId = req.params.id;
    const userId = req.user.id; // Assuming req.user.id contains the unique identifier of the viewer

    // Check if the user has already viewed this video
    const existingView = await View.findOne({ videoId, userId });

    if (!existingView) {
      // Record the view
      await View.create({ videoId, userId });
      
      // Increment the view count for the video
      await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });

      res.status(200).json("The view has been increased.");
    } else {
      res.status(400).json("You have already viewed this video.");
    }
  } catch (err) {
    next(err);
  }
};









export const random = async (req, res, next) => {
  try {
      const limit = 12; // Number of videos to return per request
      const page = parseInt(req.query.page, 10) || 1; // Get the page number from the query, default to 1

      if (page < 1) {
          return res.status(400).json({ success: false, message: "Page number must be 1 or greater." });
      }

      // Initialize session tracking for pages and returned videos if not present
      req.session.pages = req.session.pages || {};

      // Check if the page has already been fetched
      if (req.session.pages[page]) {
          const videoIds = req.session.pages[page];
          const videos = await Video.find({ _id: { $in: videoIds } });
          return res.status(200).json({ success: true, videos });
      }

      // Fetch random videos excluding videos from other pages
      const excludedIds = Object.values(req.session.pages).flat();

      const videos = await Video.aggregate([
          {
              $match: {
                  _id: {
                      $nin: excludedIds.map(id => new mongoose.Types.ObjectId(id)),
                  },
              },
          },
          { $sample: { size: limit } },
      ]);

      if (!videos || videos.length === 0) {
          return res.status(404).json({ success: false, message: "No more videos available." });
      }

      // Save the video IDs for the current page in the session
      req.session.pages[page] = videos.map(video => video._id.toString());

      res.status(200).json({ success: true, videos });
  } catch (err) {
      console.error("Error fetching random videos:", err);
      next(err);
  }
};



export const trend = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = 12; // Number of videos per page

    // Calculate the number of videos to skip
    const skip = (page - 1) * limit;

    // Fetch trending videos sorted by views in descending order
    const videos = await Video.find()
      .sort({ views: -1 }) // Sort by views in descending order
      .skip(skip) // Skip previously returned videos
      .limit(limit); // Limit the results to 12 videos

    if (!videos || videos.length === 0) {
      return res.status(404).json({ success: false, message: "No more trending videos available." });
    }

    res.status(200).json({ success: true, videos });
  } catch (err) {
    console.error("Error fetching trending videos:", err);
    next(err);
  }
};








export const sub = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const subscribedChannels = user.SubscriberedOrFollowed;

    const list = await Promise.all(
      subscribedChannels.map(async (channelId) => {
        return await Video.find({ userId: channelId });
      })
    );  

    res.status(200).json(list.flat().sort((a, b) => b.createdAt - a.createdAt));
  } catch (err) {
    next(err);
  }
};





export const FindAllUsers = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    const subscribedChannels = user.subscribedUsers;

    const list = await Promise.all(
      subscribedChannels.map(async (channelId) => {
        return await Video.find({ userId: channelId });
      })
    );

    res.status(200).json(list.flat().sort((a, b) => b.createdAt - a.createdAt));
  } catch (err) {
    next(err);
  }
};

export const getByTag = async (req, res, next) => {
  try {
      const { tagQuery } = req.query;

      if (!tagQuery) {
          return res.status(400).json({ success: false, message: 'Tag query is required' });
      }

      // Perform a query to find videos with tags that partially match the query
      const regex = new RegExp(tagQuery, 'i'); // Case-insensitive regex matching
      const videos = await Video.find({ tags: { $regex: regex } });

      if (videos.length === 0) {
          return res.status(404).json({ success: false, message: 'No matching videos found' });
      }

      res.json({ success: true, videos });
  } catch (error) {
      console.error('Error searching for videos by tag:', error);
      res.status(500).json({ success: false, message: 'Error searching for videos by tag' });
  }
};





export const search = async (req, res, next) => {
  const query = req.query.q;
  try {
    const videos = await Video.find({
      title: { $regex: query, $options: "i" },
    }).limit(40);
    res.status(200).json(videos);
  } catch (err) {
    next(err);
  }
};



export const unsaveVideo = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return next(createError(404, "User not found!"));

    // Find the video in savedVideos
    const videoIndex = user.savedVideos.findIndex(
      (savedItem) => savedItem._id.toString() === req.params.id
    );

    if (videoIndex === -1) return next(createError(400, "Video is not saved!"));

    // Remove the video from savedVideos
    const removedVideo = user.savedVideos.splice(videoIndex, 1)[0];

    await user.save();

    // Add a history record
    await addHistory(req.user.id, `You unsaved a video: ${removedVideo.title}`);

    res.status(200).json({ message: "Video unsaved successfully." });
  } catch (err) {
    next(err);
  }
};




export const copyUrl = async (req, res, next) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return next(createError(404, "Video not found"));
    }
        // Extract the video URL

    // Extract the video URL
    const videoUrl = video.videoUrl;

    res.status(200).json({ success: true, videoUrl });
  } catch (err) {
    next(err);
  }
};

export const getVideoDetailsById = async (req, res, next) => {
  try {
    const videoId = req.params.id;

    const video = await Video.findById(videoId)
      .populate('userId', 'name email') // جلب معلومات المستخدم المرتبط بالفيديو
      .populate('comments'); // جلب التعليقات المرتبطة بالفيديو

    if (!video) {
      return next(createError(404, "Video not found!"));
    }

    res.status(200).json({ success: true, video });
  } catch (err) {
    console.error('Error fetching video details by ID:', err.message);
    next(err);
  }
};








// Video upload handler
export const uploadVideo = async (req, res) => {
  try {
    const videoFile = req.file;

    // Check if video file is uploaded
    if (!videoFile) {
      return res.status(400).json({ success: false, message: 'No video file uploaded' });
    }

    // Extract user ID and fields from request body
    const { userId, title, description, thumbnailUrl, tags } = req.body;

    // Validate user ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Create a new video document
    const newVideo = new Video({
      userId, // Owner's userId
      title,
      description,
      videoUrl: videoFile.path, // Path to the uploaded file
      thumbnailUrl,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : [],
      videoKey: videoFile.filename, // Use the filename as videoKey
      owner: userId, // Reference to the owner (user ID)
      ownerName: user.name, // Fetch owner's name from user model
      ownerProfilePicture: user.profilePicture, // Fetch owner's profile picture
    });

    // Save the video to the database
    await newVideo.save();

    res.status(200).json({
      success: true,
      message: 'Video uploaded successfully',
      video: newVideo,
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ success: false, message: 'Error uploading video', error: error.message });
  }
};



export const getSavedVideos = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Fetch the user by ID
    const user = await User.findById(userId);
    if (!user) {
      return next(createError(404, "User not found"));
    }

    // Check if the user has saved videos
    if (!user.savedVideos || user.savedVideos.length === 0) {
      return res.status(404).json({ success: false, message: "No saved videos found." });
    }

    // Return the saved videos
    res.status(200).json({ success: true, savedVideos: user.savedVideos });
  } catch (err) {
    console.error("Error fetching saved videos:", err);
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



