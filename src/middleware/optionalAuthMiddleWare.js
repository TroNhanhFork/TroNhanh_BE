const jwt = require("jsonwebtoken");

const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ❌ Nếu không có token => coi là guest
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = { role: "guest", name: "Khách" };
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (decodedToken.exp && decodedToken.exp < currentTimestamp) {
      // Token hết hạn → coi như guest
      req.user = { role: "guest", name: "Khách" };
      return next();
    }

    // Token hợp lệ
    req.user = {
      id: decodedToken.userId,
      role: decodedToken.role,
      name: decodedToken.name,
    };

    next();
  } catch (error) {
    // Nếu token lỗi → không chặn, chỉ gán guest
    req.user = { role: "guest", name: "Khách" };
    next();
  }
};

module.exports = optionalAuthMiddleware;