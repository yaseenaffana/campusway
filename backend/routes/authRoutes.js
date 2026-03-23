import { Router } from 'express';
import { login, updatePassword } from '../controllers/authController.js';
import { checkRole, verifyToken } from '../middleware/auth.js';

const router = Router();

router.post('/login', login);
router.post('/bus/password', verifyToken, checkRole('driver'), updatePassword);

export default router;

