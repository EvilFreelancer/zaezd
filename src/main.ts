/** Process entry point. Everything it can do lives in `src/web/server.ts`. */
import { startServer } from './web/server.ts';

startServer(Number(process.env['PORT'] ?? 8080));
