import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);

const { express: app } = await buildApp({ connectionString: process.env.DATABASE_URL });

app.listen(PORT, () => {
  console.log(`Finder POS listening on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
