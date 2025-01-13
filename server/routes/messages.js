// routes/messages.js
import express from 'express';
import { sendMessage, getConversation,getUsersWithChatMessages, sendCommunityMessage, getGroupConversations, markMessageAsRead } from '../controllers/message.js';
import { verifyToken } from "../verifyToken.js";

const router = express.Router();

router.post('/', verifyToken, sendMessage);
router.get('/conversation/:receiverId', verifyToken, getConversation);
router.put('/:messageId/mark-as-read', verifyToken, markMessageAsRead);
router.post('/sendCommunityMessage', verifyToken, sendCommunityMessage);
router.get('/groupConversations', verifyToken, getGroupConversations);
router.get('/getUsersWithChatMessages', verifyToken, getUsersWithChatMessages);

export default router;
