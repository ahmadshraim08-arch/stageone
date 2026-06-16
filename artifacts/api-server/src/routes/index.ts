import { Router, type IRouter } from "express";
import healthRouter from "./health";
import musixmatchRouter from "./musixmatch";
import authRouter from "./auth";
import usersRouter from "./users";
import postsRouter from "./posts";
import uploadsRouter from "./uploads";
import followsRouter from "./follows";
import commentsRouter from "./comments";
import savesRouter from "./saves";
import conversationsRouter from "./conversations";
import notificationsRouter from "./notifications";
import goldenMicRouter from "./golden_mic";
import analysisRouter from "./analysis";

const router: IRouter = Router();

router.use(healthRouter);
router.use(musixmatchRouter);
router.use(authRouter);
router.use(followsRouter);
router.use(commentsRouter);
router.use(savesRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(uploadsRouter);
router.use(conversationsRouter);
router.use(notificationsRouter);
router.use(goldenMicRouter);
router.use(analysisRouter);

export default router;
