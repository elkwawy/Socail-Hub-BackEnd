
import express from "express";
import { upload } from "../multerConfig.js"; // Import the upload variable from your Multer configuration file
import { FindAllUsers,getVideoDetailsById, getSavedVideos,addVideo, uploadVideo, addView, copyUrl, deleteVideo, getByTag, getVideosByUser, random, search, sub, trend, updateVideo, saveVideo, unsaveVideo } from "../controllers/video.js";
import { verifyToken } from "../verifyToken.js";




const router = express.Router();

//create a video
router.post("/", verifyToken,addVideo)
router.put("/:id", verifyToken, updateVideo)
router.delete("/:id", verifyToken, deleteVideo)
router.get("/find/:userId", getVideosByUser);
router.put("/viewMoudel/:id",verifyToken, addView)
router.get("/trend", trend)
router.get("/random", verifyToken,random)
router.get("/spicificVideo/:id", getVideoDetailsById);

router.get("/sub",verifyToken, sub)
router.get("/FindAllUsers",verifyToken, FindAllUsers)
router.get("/tags", getByTag)
router.get("/getSavedVideos",verifyToken, getSavedVideos)
router.get("/search", search)
router.post("/save/:id", verifyToken,saveVideo)
router.post("/unsave/:id",verifyToken, unsaveVideo)
router.get("/:id/copyUrl", copyUrl);
router.post('/upload/video', verifyToken, upload.single('video'), uploadVideo);


export default router;
