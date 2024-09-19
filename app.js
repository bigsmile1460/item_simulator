import express from 'express';
import cookieParser from 'cookie-parser';
import UsersRouter from './src/routes/user.router.js'
import GameRouter from './src/routes/game.router.js'
import dotenv from 'dotenv'
//import ErrorHandlerMiddleware from "./middlewares/error-handler.middleware.js";
//import LogMiddleware from './middlewares/log.middleware.js';
//import UsersRouter from './routes/users.router.js';

dotenv.config()
const app = express();
const PORT = process.env.port;

//app.use(LogMiddleware);

//json, bodyparser 미들웨어
app.use(express.json());
app.use(cookieParser());
//app.use(express.urlencoded({ extended: true }));

//라우터
const router = express.Router();

//서버 상태 확인용
router.get("/", (req, res) => {
  return res.status(200).json({ message: "hello" });
});


app.use("/api", [UsersRouter,GameRouter]);

// 에러 핸들링 미들웨어
//app.use(ErrorHandlerMiddleware);


app.listen(PORT, () => {
    console.log(PORT, "포트로 서버가 열렸어요!");
});



