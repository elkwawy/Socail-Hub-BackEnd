import express from "express";
import { addComment, isCommentByUser,deleteComment, getReplies,addReply, getCommentsByObjectId } from "../controllers/comment.js";
import {verifyToken} from "../verifyToken.js"
const router = express.Router();

router.post("/", verifyToken, addComment)
router.post("/addReply", verifyToken, addReply)
router.get("/isCommentByUser/:commentId", verifyToken, isCommentByUser); 
router.get("/:objectId",verifyToken, getCommentsByObjectId)
router.get('/replies/:commentId',verifyToken, getReplies);

export default router;
