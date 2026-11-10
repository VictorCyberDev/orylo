import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/auth/auth";
export const { GET, POST } = toNextJsHandler(getAuth());
