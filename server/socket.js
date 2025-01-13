import { Server } from "socket.io";

const io = new Server({
  cors: {
    origin: "http://localhost:5173", // عنوان الفرونت إند
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Object to keep track of online users
global.onlineUsers = new Map();

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("add-user", (userId) => {
    console.log(`User added: ${userId}`);
    global.onlineUsers.set(userId, socket.id);
  });

  // socket.on("join-community", (communityId) => {
  //   console.log(`User with socket ID ${socket.id} joined community ${communityId}`);
  //   socket.join(communityId);
  // });

  // socket.on("leave-community", (communityId) => {
  //   socket.leave(communityId);
  //   console.log(`User with socket ID ${socket.id} left community ${communityId}`);
  // });

  // socket.on("send-notification", (data) => {
  //   console.log(`Notification sent to: ${data.to}`);
  //   const sendUserSocket = global.onlineUsers.get(data.to);
  //   if (sendUserSocket) {
  //     socket.to(sendUserSocket).emit("notification-received", data);
  //   }
  // });

  // socket.on("send-community-message", (data) => {
  //   console.log(`Message sent to community ${data.communityId}`);
  //   io.to(data.communityId).emit("community-message-received", data);
  // });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    global.onlineUsers.forEach((value, key) => {
      if (value === socket.id) global.onlineUsers.delete(key);
    });
  });
});

export default io;
