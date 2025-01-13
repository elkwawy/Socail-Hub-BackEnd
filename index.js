import dotenv from 'dotenv';
dotenv.config(); // Ensure this is at the top to load environment variables

console.log("Email User:", process.env.EMAIL_USER);
console.log("Email Pass:", process.env.EMAIL_PASS);

import express from 'express';
import mongoose from 'mongoose';
import session from 'express-session'; // Added express-session for OTP verification
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import connectDB from './db.js';
import userRoutes from './routes/users.js';
import videoRoutes from './routes/videos.js';
import commentRoutes from './routes/comments.js';
import authRoutes from './routes/auth.js';
import postRoutes from './routes/routPost.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import communitiesRoutes from './routes/communities.js';
import balanceRoutes from './routes/balances.js';
import ownerRoutes from './routes/ownners.js';
import premiumPlanRoutes from './routes/premiumPlanRoutes.js';
import storeRoutes from './routes/activityRoutes.js';
import historyRoutes from './routes/historyRoutes.js';
import reportRoutes from './routes/reports.js';
import chatRoutes from './routes/chatRoutes.js';
import callRoutes from './routes/calls.js';
import { verifyToken } from './verifyToken.js';
import { auth } from "./firebase.js";
import Notification from './models/Notification.js';

console.log("Mongo URI:", process.env.MONGO_URI);
console.log("Port:", process.env.PORT);

const app = express();
const PORT = process.env.PORT ;

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public'));

// Added session middleware for OTP handling
app.use(session({
  secret: process.env.SESSION_SECRET, // Use a strong secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, maxAge: 10 * 60 * 1000 } // 10 minutes for OTP expiration
}));

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", 
    methods: ["GET", "POST"],
    credentials: true,
  },
});

global.onlineUsers = new Map();

global.chatSocket = io;

io.on("connection", (socket) => {
  console.log("New socket connection:", socket.id);

  socket.on("add-user", (userId) => {
    if (userId) {
      console.log("user added", userId);
      global.onlineUsers.set(userId, socket.id);
    }
  });

  socket.on("join-community", (communityId) => {
    console.log(`User with socket ID ${socket.id} joined community ${communityId}`);
    socket.join(communityId);
  });

  socket.on("leave-community", (communityId) => {
    socket.leave(communityId);
    console.log(`User with socket ID ${socket.id} left community ${communityId}`);
  });
  
  socket.on("send-community-message", (data) => {
    console.log(`Message sent to community ${data.communityId}`);
    io.to(data.communityId).emit("community-message-received", data);
  });

  // Real-Time Notifications
  socket.on("send-notification", async (data) => {
    try {
      const { to, from, message } = data;

      // Save notification to the database
      const notification = await Notification.create({
        message,
        TO: to,
        FROM: from,
      });

      const sendUserSocket = global.onlineUsers.get(to);
      if (sendUserSocket) {
        socket.to(sendUserSocket).emit("notification-received", notification);
      }
    } catch (error) {
      console.error("Error handling send-notification:", error);
    }
  });

  // Handle messages
  socket.on("send-msg", (data) => {
    console.log("send-msg", data);
    try {
      const sendUserSocket = global.onlineUsers.get(data.to);
      if (sendUserSocket) {
        console.log("sendUserSocket", sendUserSocket);
        socket.to(sendUserSocket).emit("msg-recieve", data);
        console.log("msg-recieve", data);
      }
    } catch (error) {
      console.error("Error handling send-msg:", error);
    }
  });

  // Handle calls
  socket.on("call-user", ({ from, to, offer }) => {
    try {
      const targetSocket = global.onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit("call-made", { from, offer });
      }
    } catch (error) {
      console.error("Error handling call-user:", error);
    }
  });

  socket.on("make-answer", ({ from, to, answer }) => {
    try {
      const targetSocket = global.onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit("answer-made", { from, answer });
      }
    } catch (error) {
      console.error("Error handling make-answer:", error);
    }
  });

  socket.on("ice-candidate", ({ from, to, candidate }) => {
    try {
      const targetSocket = global.onlineUsers.get(to);
      if (targetSocket) {
        io.to(targetSocket).emit("ice-candidate", { from, candidate });
      }
    } catch (error) {
      console.error("Error handling ice-candidate:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
    for (const [userId, socketId] of global.onlineUsers.entries()) {
      if (socketId === socket.id) {
        global.onlineUsers.delete(userId);
        break;
      }
    }
  });
});

app.post("/api/call", verifyToken, (req, res) => {
  const { to, offer } = req.body;
  const from = req.user.id;

  const targetSocket = global.onlineUsers.get(to);
  if (targetSocket) {
    io.to(targetSocket).emit("call-made", { from, offer });
    res.status(200).json({ message: "Call initiated" });
  } else {
    res.status(404).json({ message: "User not online" });
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true, 
  serverSelectionTimeoutMS: 30000, // Increase server selection timeout
  socketTimeoutMS: 45000, // Increase socket timeout
}).then(() => {
  console.log("MongoDB connected");
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch((error) => {
  console.error('Connection error', error.message);
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/routPost", postRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/communities", communitiesRoutes);
app.use("/api/balances", balanceRoutes);
app.use("/api/owners", ownerRoutes);
app.use('/api/premium-plans', premiumPlanRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/chatRoutes', chatRoutes);
app.use('/api/calls', verifyToken, callRoutes);
app.use('/uploads', express.static('uploads'));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Something went wrong!";
  console.error("Error middleware triggered:", status, message);
  return res.status(status).json({
    success: false,
    status,
    message,
  });
});
