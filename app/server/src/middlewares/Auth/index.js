const authUtils = require('../../utils/auth');
const User = require('../../models/User');
const {
  DEV_OFFLINE_USER,
  isDevRuntime,
  isDevOfflineUserId,
} = require('../../constants/devOfflineUser');

const requireAuth = async (req, res, next) => {
  const cookieAccessToken = req.cookies?.accessToken;
  const cookieRefreshToken = req.cookies?.refreshToken;
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;
  const accessToken = cookieAccessToken || bearerToken;

  if (!accessToken && !cookieRefreshToken) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  let userId = null;
  const decodedAccessToken = authUtils.decodeAccessToken({ accessToken });
  if (decodedAccessToken && decodedAccessToken.userId) {
    userId = decodedAccessToken.userId;
  } else {
    const decodedRefreshToken = authUtils.decodeRefreshToken({
      refreshToken: cookieRefreshToken,
    });
    userId = decodedRefreshToken?.userId;
    if (userId) {
      authUtils.generateAccessToken({
        userId,
        res,
      });
    }
  }

  if (!userId) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  // get user info from database (or offline fallback when DB is down)
  let user = null;
  try {
    user = await User.findByPk(userId, {
      raw: true,
    });
  } catch (err) {
    console.error(err);
  }

  if (!user && isDevRuntime() && isDevOfflineUserId(userId)) {
    user = { ...DEV_OFFLINE_USER };
  }

  if (user) {
    req['user'] = { ...user };
  }
  next();
}

module.exports = {
  requireAuth,
}
