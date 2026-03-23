import { Router } from 'express';
import { checkRole, verifyToken } from '../middleware/auth.js';
import {
  disconnectBus,
  getBusByNo,
  getBusHistory,
  getLiveBuses,
  updateBusLocation
} from '../controllers/busController.js';

const createBusRouter = (io) => {
  const router = Router();

  router.get('/buses/live', getLiveBuses);
  router.get('/buses', getLiveBuses);
  router.get('/bus/:busNo', getBusByNo);
  router.get('/location/history/:username', getBusHistory);

  // Driver-only updates
  router.post('/bus/update-location', verifyToken, checkRole('driver'), updateBusLocation(io));
  router.post('/bus/disconnect', verifyToken, checkRole('driver'), disconnectBus);

  // Compatibility aliases for old frontend calls
  router.post('/location/update', verifyToken, checkRole('driver'), async (req, res, next) => {
    req.body = {
      busNo: req.user?.busNo,
      lat: req.body?.latitude,
      lng: req.body?.longitude,
      speed: req.body?.speed
    };
    return updateBusLocation(io)(req, res, next);
  });

  router.get('/location/live/:username', async (req, res) => {
    req.params.busNo = req.params.username;
    return getBusByNo(req, res);
  });

  return router;
};

export default createBusRouter;

