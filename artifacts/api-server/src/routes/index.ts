import { Router, type IRouter } from "express";
import healthRouter from "./health";
import musixmatchRouter from "./musixmatch";

const router: IRouter = Router();

router.use(healthRouter);
router.use(musixmatchRouter);

export default router;
