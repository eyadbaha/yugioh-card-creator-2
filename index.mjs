import serverlessExpress from "@vendia/serverless-express";
import { createDefaultApp } from "./build/app.js";

const app = createDefaultApp();
const serverlessExpressHandler = serverlessExpress({ app });

export const handler = async (event, context) => serverlessExpressHandler(event, context);
