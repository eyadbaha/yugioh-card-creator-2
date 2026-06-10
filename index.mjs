import serverlessExpress from "@vendia/serverless-express";
import { app } from "./build/app.js";

const serverlessExpressHandler = serverlessExpress({ app });

export const handler = async (event, context) => serverlessExpressHandler(event, context);
