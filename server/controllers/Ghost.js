import User from "../models/User.js";
import PremiumPlan from "../models/premiumPlanModel.js"; // Import the PremiumPlan model
import { createError } from "../error.js";

// Helper function to generate random numbers
const generateRandomNumber = () => {
  const length = Math.floor(Math.random() * 3) + 2; // Random length: 2, 3, or 4
  return Math.floor(Math.pow(10, length - 1) + Math.random() * (Math.pow(10, length) - Math.pow(10, length - 1)));
};

export const toggleGhostMode = async (req, res) => {
    try {
      const userId = req.user.id; // Assuming user ID is obtained from the authenticated request
      const { action } = req.body; // Extract action from request body: "active" or "dis"
  
      if (!action) {
        throw createError(400, "Missing required 'action' parameter.");
      }
  
      // Find the user by ID
      const user = await User.findById(userId);
      if (!user) {
        throw createError(404, "User not found.");
      }
  
      if (action === "active") {
        // Check if ghost mode is already active
        if (user.isGhost) {
          return res.status(400).json({
            success: false,
            message: "Ghost mode is already active.",
          });
        }
  
        // Save original data to ghostProfile
        user.ghostProfile = {
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture || null, // Save the original profile picture
          coverPicture: user.coverPicture || null, // Save the original cover picture
          desc: user.desc || null, // Save the original description
        };
  
        // Generate dynamic ghost name
        const randomNumber = generateRandomNumber();
        user.name = `Mared${randomNumber}`;
        user.profilePicture = "https://img.freepik.com/premium-vector/ghost_1170280-17.jpg";
        user.coverPicture = "https://a-static.besthdwallpaper.com/a-ghost-story-wallpaper-3840x800-15914_112.jpg";
  
        user.isGhost = true; // Activate ghost mode
      } else if (action === "dis") {
        // Check if ghost mode is already inactive
        if (!user.isGhost) {
          return res.status(400).json({
            success: false,
            message: "Ghost mode is already inactive.",
          });
        }
  
        // Deactivate ghost mode and restore original data
        if (!user.ghostProfile) {
          throw createError(400, "No original data found to restore.");
        }
  
        // Restore original data from ghostProfile
        user.name = user.ghostProfile.name || user.name;
        user.email = user.ghostProfile.email || user.email;
        user.profilePicture = user.ghostProfile.profilePicture || ""; // Restore profile picture
        user.coverPicture = user.ghostProfile.coverPicture || ""; // Restore cover picture
        user.desc = user.ghostProfile.desc || ""; // Restore description
  
        user.ghostProfile = null; // Clear the ghostProfile
        user.isGhost = false; // Deactivate ghost mode
      } else {
        throw createError(400, "Invalid 'action' parameter. Use 'active' or 'dis'.");
      }
  
      // Save the updated user
      await user.save();
  
      const message =
        action === "active"
          ? "Ghost mode activated successfully."
          : "Ghost mode deactivated successfully.";
      res.status(200).json({ success: true, message });
    } catch (error) {
      console.error("Error toggling ghost mode:", error);
      res.status(error.status || 500).json({ success: false, message: error.message || "Internal Server Error" });
    }
  };
  