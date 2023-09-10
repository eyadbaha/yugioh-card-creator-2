import serverlessExpress from "@vendia/serverless-express";
import { app } from "./build/app.js";

export const handler = serverlessExpress({ app });
