import * as celery from "celery-node";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379/0";

export const getCeleryClient = () => {
    console.log("Creating Celery client with REDIS_URL:", REDIS_URL);
    return celery.createClient(
        REDIS_URL,
        REDIS_URL,
        "celery" // Match default celery queue
    );
};
