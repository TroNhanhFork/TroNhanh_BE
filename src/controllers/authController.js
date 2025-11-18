const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const dotenv = require("dotenv");
dotenv.config();

const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.CLIENT_ID);

const UserOTP = require("../models/UserOTP");
const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user._id, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};
const generateRefreshToken = (user) => {
  return jwt.sign({ userId: user._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role, gender } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already has been used" });

    const newUser = new User({
      name,
      email,
      password,
      phone,
      role,
      gender,
      verified: false,
    });
    await newUser.save();

    res.status(201).json({
      message: "Register successfully",
      userId: newUser._id,
      email: newUser.email,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Tìm user theo email
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: `Email doesn't exist` });
 
  if (user.isDeleted) {
      return res.status(403).json({ message: "This account has been deleted." });
    }
    // Kiểm tra trạng thái tài khoản
    if (user.status === "inactive") {
      return res.status(403).json({ message: "Your account is not yet activated by admin." });
    }

    if (user.status === "banned") {
      return res.status(403).json({ message: "Your account has been banned. Please contact support." });
    }
       if (!user.verified) {
      return res.status(400).json({ message: "Email is not verified" });
    }
    console.log("🔹 password from body:", password);
console.log("🔹 user.password from DB:", user.password);
    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Wrong password" });


    // Tạo JWT
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    res.status(200).json({
      message: "Login successfully",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("🔥 Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.refreshToken = (req, res) => {
  const token = req.body.refreshToken;
  if (!token) return res.status(401).json({ message: "No token provided" });
  jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    const newAccessToken = generateAccessToken({ _id: decoded.userId });
    return res.json({
      accessToken: newAccessToken,
      expiresIn: 30 * 1000,
    });
  });
};
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.AUTH_EMAIL,
    pass: process.env.AUTH_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

exports.sendOTP = async (req, res) => {
  try {
    const { id, email } = req.body;
    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    if (!email) {
      return res.status(400).json({
        status: "Failed",
        message: "Email is required",
      });
    }
    const mailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Verify Your Email",
      html: `
        <p>Enter <b>${otp}</b> in the app to verify your email address</p>
        <p>This code <b>expires in 30 minutes</b></p>
      `,
    };

    const saltRounds = 10;
    const hashOTP = await bcrypt.hash(otp, saltRounds);

    const newUserOTP = new UserOTP({
      userId: id,
      otp: hashOTP,
      createdAt: Date.now(),
      expiredAt: Date.now() + 30 * 60 * 1000,
    });

    await newUserOTP.save();
    await transporter.sendMail(mailOptions);

    res.json({
      status: "INACTIVE",
      message: "Verify OTP email",
      data: {
        userId: id,
        email,
      },
    });
  } catch (error) {
    console.log(error);
    res.json({
      status: "Failed",
      message: error.message,
    });
  }
};
exports.verifyOTP = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const userOTPRecord = await UserOTP.findOne({ userId });
    if (!userOTPRecord)
      return res.status(400).json({ message: "OTP not found" });

    if (userOTPRecord.expiredAt < Date.now()) {
      await UserOTP.deleteMany({ userId });
      return res.status(400).json({ message: "OTP expired" });
    }

    const isMatch = await bcrypt.compare(otp, userOTPRecord.otp);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    await User.updateOne(
      { _id: userId },
      { $set: { status: "active", verified: true } }
    );

    await UserOTP.deleteMany({ userId });

    const user = await User.findById(userId);

    res.json({
      message: "Email verified successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        verified: user.verified,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

exports.resendOTP = async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId || !email) {
      return res.status(400).json({
        status: "Failed",
        message: "User ID and email are required",
      });
    }

    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;

    const mailOptions = {
      from: process.env.AUTH_EMAIL,
      to: email,
      subject: "Verify Your Email - Resend",
      html: `
        <p>Enter <b>${otp}</b> in the app to verify your email address.</p>
        <p>This code <b>expires in 30 minutes</b>.</p>
      `,
    };

    const saltRounds = 10;
    const hashOTP = await bcrypt.hash(otp, saltRounds);

    await UserOTP.deleteMany({ userId });

    const newUserOTP = new UserOTP({
      userId,
      otp: hashOTP,
      createdAt: Date.now(),
      expiredAt: Date.now() + 30 * 60 * 1000,
    });

    await newUserOTP.save();
    await transporter.sendMail(mailOptions);

    res.json({
      status: "INACTIVE",
      message: "OTP resent successfully",
      data: {
        userId,
        email,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      status: "Failed",
      message: error.message,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user found with this email" });
    }

    // Tạo token reset
    const token = crypto.randomBytes(32).toString("hex");

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      auth: {
        user: process.env.AUTH_EMAIL,
        pass: process.env.AUTH_PASS,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    await transporter.sendMail({
      from: process.env.AUTH_EMAIL,
      to: user.email,
      subject: "Reset your password",
      html: `
        <p>You requested to reset your password.</p>
        <p>Click this link to reset: <a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires in 1 hour.</p>
      `,
    });

    return res.json({ message: "Reset link sent to your email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};



exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "No Google token provided" });

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      // 🔹 Tạo user Google mới
      user = new User({
        name: name || "Google User",
        email,
        googleId: payload.sub,
        provider: "google",
        status: "active",
        verified: true,
        role: "pending",
        avatar: picture,
      });
      await user.save();
    } else {
      if (user.isDeleted)
        return res.status(403).json({ message: "This account has been deleted." });
      if (user.status === "inactive")
        return res.status(403).json({ message: "Account not activated." });
      if (user.status === "banned")
        return res.status(403).json({ message: "Account banned." });
    }

    // ⚠️ Nếu chưa chọn role
    if (user.role === "pending") {
      return res.json({
        message: "Google login successful - please select role",
        needRoleSelection: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
        },
      });
    }

    // ✅ Nếu đã có role → cấp token
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    console.log("📦 Response being sent to frontend:", {
      message: "Google login successful",
      needRoleSelection: false,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });

    // ✅ Trả dữ liệu thật cho frontend
    return res.json({
      message: "Google login successful",
      needRoleSelection: false,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (err) {
    console.error("🔥 Google login error:", err);
    res.status(500).json({ message: "Google login failed" });
  }
};
 

// Set role cho user Google
exports.setRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    if (!["owner", "customer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.role = role;
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      message: "Role set successfully",
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });
  } catch (err) {
    console.error("Set role error:", err);
    res.status(500).json({ message: "Failed to set role" });
  }
};