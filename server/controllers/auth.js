import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import { createError } from "../error.js";
import jwt from "jsonwebtoken";
import Balance from "../models/Balance.js";
import Owner from '../models/Owner.js';  // Import the Owner model
import FakeUser from '../models/FakeUser.js';  // Import the FakeUser model
import { addHistory } from '../controllers/historyController.js'; // Import the function to add history entries
import { auth } from '../firebase.js'; // Adjust the path accordingly
import { sendPasswordResetEmail, confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import cookieParser from "cookie-parser";
import express from "express";
import { sendOTPEmail } from "./OTP.js"; // استيراد وظيفة إرسال البريد
import SibApiV3Sdk from "sib-api-v3-sdk";
import session from "express-session";
import cron from "node-cron";

dotenv.config();

const app = express();


dotenv.config();




// Initialize Brevo (Sendinblue) API Client
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY2;

// OTP Generator
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Function to send OTP to email
export const sendPasswordOTP = async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return next(createError(404, "User with this email does not exist!"));
    }

    // Generate OTP and set expiration time
    const otp = generateOTP();
    user.tempOTP = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
    await user.save();

    // Send OTP email using Brevo
    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    const sendSmtpEmail = {
      to: [{ email, name: user.name }],
      sender: { email: process.env.EMAIL_USER, name: process.env.SenderName },
      subject: "Password Reset OTP",
      htmlContent: `<p>Your OTP for password reset is: <strong>${otp}</strong>. It is valid for 10 minutes.</p>`,
    };

    await apiInstance.sendTransacEmail(sendSmtpEmail);

    res.status(200).json({ message: "OTP has been sent to your email." });
  } catch (err) {
    next(err);
  }
};

// Function to verify OTP and reset password
export const verifyOTPAndResetPassword = async (req, res, next) => {
  const { email, otp, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return next(createError(404, "User with this email does not exist!"));
    }

    // Check if OTP matches and is not expired
    if (otp !== user.tempOTP || Date.now() > user.otpExpires) {
      return next(createError(400, "Invalid or expired OTP!"));
    }

    // Hash the new password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

    // Update password and clear OTP
    user.password = hashedPassword;
    user.tempOTP = null;
    user.otpExpires = null;
    await user.save();

    res.status(200).json({ message: "Password has been reset successfully!" });
  } catch (err) {
    next(err);
  }
};











// Function to handle user sign-in
export const signin = async (req, res, next) => {
  try {
    const { name, password } = req.body;

    // Step 1: Find user
    const user = await User.findOne({ name });
    if (!user) return next(createError(404, "Username or password is incorrect!"));

    // Step 2: Verify password
    const isCorrect = await bcrypt.compare(password, user.password);
    if (!isCorrect) return next(createError(400, "Username or password is incorrect!"));

    // Step 3: Check or create balance
    let userBalance = await Balance.findOne({ user: user._id });

    if (!userBalance) {
      // Create a new balance with the initial value of 85
      userBalance = await Balance.create({
        user: user._id,
        currentCoins: 85,
        lastUpdated: new Date(),
      });
      console.log(`Initial balance of 85 created for user: ${user.name}`);
    }

    // Step 4: Validate environment variables
    if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
      console.error("JWT_SECRET or JWT_REFRESH_SECRET is missing");
      throw new Error("Environment variables for JWT are not set.");
    }

    // Step 5: Generate new tokens
    const accessToken = jwt.sign(
      { id: user._id, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    // Step 6: Update user's refresh token in database
    user.refreshToken = refreshToken;
    await user.save();

    // Step 7: Set the tokens in cookies
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000, // 15 دقائق
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
    });

    // Step 8: Send response with all user data
    const { password: _, refreshToken: __, ...userData } = user._doc;

    res.status(200).json({
      success: true,
      message: "Login successful! Tokens have been refreshed.",
      user: {
        ...userData, // Include all user data except sensitive ones
        balance: userBalance.currentCoins, // Include user's balance
      },
    });
  } catch (err) {
    console.error("Error during sign-in:", err);
    next(err);
  }
};






export const signup = async (req, res, next) => {
  try {
    const { email, name, password, otp } = req.body;

    // Step 1: Check if OTP is provided
    if (!otp) {
      // Generate OTP
      const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return next(createError(400, "Email already exists."));
      }

      // Temporarily store OTP and related data in memory
      req.session = req.session || {};
      req.session.tempUser = { name, email, password: bcrypt.hashSync(password, 10), otp: generatedOTP, otpExpires: Date.now() + 10 * 60 * 1000 };

      // Send OTP email
      await sendOTPEmail(email, generatedOTP);

      return res.status(202).json({
        success: true,
        message: "OTP has been sent to your email. Please verify to complete sign-up.",
      });
    }

    // Step 2: Verify OTP
    if (!req.session || !req.session.tempUser) {
      return next(createError(400, "No OTP session found. Please request a new OTP."));
    }

    const { tempUser } = req.session;

    if (otp !== tempUser.otp || Date.now() > tempUser.otpExpires) {
      return next(createError(400, "Invalid or expired OTP."));
    }

    // Save user data after OTP verification
    const newUser = new User({
      name: tempUser.name,
      email: tempUser.email,
      password: tempUser.password,
    });

    await newUser.save();

    // Clear session OTP data
    req.session.tempUser = null;

    return res.status(200).json({
      success: true,
      message: "Sign-up successful! You can now log in.",
    });
  } catch (err) {
    next(err);
  }
};








export const googleAuth = async (req, res, next) => {
  try {
    const { email, name, img } = req.body;

    // البحث عن المستخدم
    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        name,
        email,
        fromGoogle: true,
        profilePicture: img,
      });
      await user.save();

      // إنشاء رصيد جديد
      await Balance.create({
        user: user._id,
        currentCoins: 85,
      });
    }

    // إنشاء التوكن
    const accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const refreshToken = jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: "7d",
    });

    user.refreshToken = refreshToken;
    await user.save();

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful via Google!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
};


export const sendPasscode = async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return next(createError(404, "User with this email does not exist!"));
    }

    // Use Firebase to send password reset email
    await sendPasswordResetEmail(auth, email);

    console.log(`Password reset email sent to: ${email}`);

    res.status(200).json({ message: 'Passcode sent to your email!' });
  } catch (err) {
    console.error("Error sending passcode:", err);
    next(err);
  }
};

// Function to reset password
export const resetPassword = async (req, res, next) => {
  const { oobCode, newPassword } = req.body;

  try {
    // Verify the password reset code
    await verifyPasswordResetCode(auth, oobCode);

    // Confirm the password reset with the code and new password
    await confirmPasswordReset(auth, oobCode, newPassword);

    res.status(200).json({ message: 'Password has been changed!' });
  } catch (err) {
    next(err);
  }
};
