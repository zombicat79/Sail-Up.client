// server/routers/inn/captain-json.js
import express from "express";
import path from "path";

export default function createCaptainJsonRouter() {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.sendFile(path.join(process.cwd(), "apps", "inn", "captain-json.html"));
  });

  // aquí, si luego añades APIs propias (subidas JSON/CSV, etc.)

  return router;
}