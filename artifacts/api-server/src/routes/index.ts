import { Router, type IRouter } from "express";
import healthRouter from "./health";
import musixmatchRouter from "./musixmatch";
import authRouter from "./auth";
import usersRouter from "./users";
import postsRouter from "./posts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(musixmatchRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(postsRouter);

export default router;
