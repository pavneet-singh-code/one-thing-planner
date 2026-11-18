// Vercel entry point. vercel.json rewrites /api/* here; Hono routes on the original path.
import app from '../server/app.js';

const handle = (req: Request) => app.fetch(req);
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const PUT = handle;
