import app from "./app.js";
import { env } from "./shared/utils/env.js";

app.listen(env.PORT, () => {
  console.log(`PMO Portal backend listening on port ${env.PORT} [${env.NODE_ENV}]`);
});
