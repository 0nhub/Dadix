const Router = require('express');
const userControllers = require('../../controllers/User');
const authMiddlewares = require('../../middlewares/Auth');

const router = Router();

router.get('/', authMiddlewares.requireAuth, userControllers.getUserInfo);
router.patch('/', authMiddlewares.requireAuth, userControllers.updateUserInfo);
router.post('/delete', authMiddlewares.requireAuth, userControllers.deleteUser);

module.exports = router;
